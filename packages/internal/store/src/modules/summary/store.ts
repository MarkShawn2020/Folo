import type { SummarySchema } from "@follow/database/schemas/types"
import { summaryService } from "@follow/database/services/summary"
import type { SupportedActionLanguage } from "@follow/shared"
import { toApiSupportedActionLanguage } from "@follow/shared"
import { FollowAPIError } from "@follow-app/client-sdk"

import { api } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { getEntry } from "../entry/getter"
import type { EntryModel } from "../entry/types"
import { SummaryGeneratingStatus } from "./enum"
import type { StatusID } from "./utils"
import { getGenerateSummaryStatusId } from "./utils"

type SummaryModel = Omit<SummarySchema, "createdAt">

interface SummaryData {
  summary: string
  readabilitySummary: string | null
  lastAccessed: number
}

interface SummaryState {
  /**
   * Key: entryId
   * Value: language -> SummaryData
   */
  data: Record<string, Partial<Record<SupportedActionLanguage, SummaryData>>>

  generatingStatus: Record<StatusID, SummaryGeneratingStatus>
}
const emptyDataSet: Record<string, Partial<Record<SupportedActionLanguage, SummaryData>>> = {}

export const useSummaryStore = createZustandStore<SummaryState>("summary")(() => ({
  data: emptyDataSet,
  generatingStatus: {},
}))

const get = useSummaryStore.getState
const set = useSummaryStore.setState
const immerSet = createImmerSetter(useSummaryStore)
class SummaryActions implements Resetable, Hydratable {
  async hydrate() {
    const summaries = await summaryService.getAllSummaries()
    this.upsertManyInSession(summaries)
  }

  upsertManyInSession(summaries: SummaryModel[]) {
    const now = Date.now()
    immerSet((state) => {
      summaries.forEach((summary) => {
        if (!summary.language) return

        if (!state.data[summary.entryId]) {
          state.data[summary.entryId] = {}
        }
        if (!state.data[summary.entryId]![summary.language]) {
          state.data[summary.entryId]![summary.language] = {
            summary: "",
            readabilitySummary: null,
            lastAccessed: now,
          }
        }

        state.data[summary.entryId]![summary.language] = {
          summary: summary.summary || state.data[summary.entryId]![summary.language]!.summary || "",
          readabilitySummary:
            summary.readabilitySummary ||
            state.data[summary.entryId]![summary.language]!.readabilitySummary ||
            null,
          lastAccessed: now,
        }
      })
    })

    this.batchClean()
  }

  async upsertMany(summaries: SummaryModel[]) {
    this.upsertManyInSession(summaries)

    for (const summary of summaries) {
      summaryService.insertSummary(summary)
    }
  }

  getSummary(entryId: string, language: SupportedActionLanguage) {
    const state = get()
    const summary = state.data[entryId]?.[language]

    if (summary) {
      immerSet((state) => {
        if (state.data[entryId]) {
          state.data[entryId]![language]!.lastAccessed = Date.now()
        }
      })
    }

    return summary
  }

  private batchClean() {
    const state = get()
    const entries = Object.entries(state.data)
      .map(([, data]) => data)
      .flatMap((data) => Object.entries(data))

    if (entries.length <= 10) return

    const sortedEntries = entries.sort(
      ([, a], [, b]) => (a?.lastAccessed || 0) - (b?.lastAccessed || 0),
    )

    const entriesToRemove = sortedEntries.slice(0, entries.length - 10)

    immerSet((state) => {
      entriesToRemove.forEach(([entryId]) => {
        delete state.data[entryId]
      })
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set({
        data: emptyDataSet,
        generatingStatus: {},
      })
    })
    tx.persist(() => {
      summaryService.reset()
    })

    await tx.run()
  }
}

export const summaryActions = new SummaryActions()

export interface SummaryGeneratorContext {
  entry: EntryModel
  target: "content" | "readabilityContent"
  actionLanguage: SupportedActionLanguage
  abortSignal?: AbortSignal
  onSummaryUpdate?: (summary: string) => void
}

export type SummaryGenerator = (context: SummaryGeneratorContext) => Promise<string | null>

class SummarySyncService {
  private pendingPromises: Record<StatusID, Promise<string | null>> = {}

  private upsertSummaryInSession({
    entryId,
    actionLanguage,
    target,
    summary,
    status,
  }: {
    entryId: string
    actionLanguage: SupportedActionLanguage
    target: "content" | "readabilityContent"
    summary: string
    status?: SummaryGeneratingStatus
  }) {
    immerSet((state) => {
      if (!state.data[entryId]) {
        state.data[entryId] = {}
      }

      state.data[entryId][actionLanguage] = {
        summary:
          target === "content" ? summary : state.data[entryId]?.[actionLanguage]?.summary || "",
        readabilitySummary:
          target === "readabilityContent"
            ? summary
            : state.data[entryId]?.[actionLanguage]?.readabilitySummary || null,
        lastAccessed: Date.now(),
      }

      if (status) {
        state.generatingStatus[getGenerateSummaryStatusId(entryId, actionLanguage, target)] = status
      }
    })
  }

  async generateSummary({
    entryId,
    target,
    actionLanguage,
    generator,
    abortSignal,
  }: {
    entryId: string
    target: "content" | "readabilityContent"
    actionLanguage: SupportedActionLanguage
    generator?: SummaryGenerator
    abortSignal?: AbortSignal
  }): Promise<string | null> {
    const entry = getEntry(entryId)
    if (!entry) return null

    const statusID = getGenerateSummaryStatusId(entryId, actionLanguage, target)
    const state = get()
    if (state.generatingStatus[statusID] === SummaryGeneratingStatus.Pending)
      return this.pendingPromises[statusID] || null

    const existing =
      state.data[entryId]?.[actionLanguage]?.[
        target === "content" ? "summary" : "readabilitySummary"
      ]
    if (existing) {
      return existing
    }

    immerSet((state) => {
      state.generatingStatus[statusID] = SummaryGeneratingStatus.Pending
    })

    const handleSummaryUpdate = (summary: string) => {
      if (!summary) {
        return
      }

      this.upsertSummaryInSession({
        entryId,
        actionLanguage,
        target,
        summary,
        status: SummaryGeneratingStatus.Pending,
      })
    }

    const pendingPromise = (async () => {
      if (generator) {
        return generator({
          entry,
          target,
          actionLanguage,
          abortSignal,
          onSummaryUpdate: handleSummaryUpdate,
        })
      }

      // Use Our AI to generate summary
      const summary = await api().ai.summary({
        id: entryId,
        language: toApiSupportedActionLanguage(actionLanguage),
        target,
      })

      if (!summary.data) {
        throw new FollowAPIError("AI summary limit exceeded. Please try again later.", 402)
      }

      return summary.data
    })()
      .then((summary) => {
        if (!summary) {
          immerSet((state) => {
            state.generatingStatus[statusID] = SummaryGeneratingStatus.Success
          })

          return null
        }

        this.upsertSummaryInSession({
          entryId,
          actionLanguage,
          target,
          summary,
          status: SummaryGeneratingStatus.Success,
        })

        return summary
      })
      .catch((error) => {
        immerSet((state) => {
          state.generatingStatus[statusID] = SummaryGeneratingStatus.Error
        })

        throw error
      })
      .finally(() => {
        delete this.pendingPromises[statusID]
      })

    this.pendingPromises[statusID] = pendingPromise
    const summary = await pendingPromise

    if (summary) {
      summaryActions.upsertMany([
        {
          entryId,
          summary: target === "content" ? summary : "",
          language: actionLanguage ?? null,
          readabilitySummary: target === "readabilityContent" ? summary : null,
        },
      ])
    }

    return summary
  }
}

export const summarySyncService = new SummarySyncService()
