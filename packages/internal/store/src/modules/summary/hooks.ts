import type { SupportedActionLanguage } from "@follow/shared"
import { useQuery } from "@tanstack/react-query"

import type { GeneralQueryOptions } from "../../types"
import type { SummaryGenerator } from "./store"
import { summarySyncService, useSummaryStore } from "./store"
import { getGenerateSummaryStatusId } from "./utils"

export const useSummary = (entryId: string, language: SupportedActionLanguage) => {
  const summary = useSummaryStore((state) => state.data[entryId]?.[language])
  return summary
}

export const useSummaryStatus = ({
  entryId,
  actionLanguage,
  target,
}: {
  entryId: string
  actionLanguage: SupportedActionLanguage
  target: "content" | "readabilityContent"
}) => {
  const status = useSummaryStore(
    (state) => state.generatingStatus[getGenerateSummaryStatusId(entryId, actionLanguage, target)],
  )
  return status
}

export function usePrefetchSummary({
  entryId,
  target,
  actionLanguage,
  summaryGenerator,
  summaryGeneratorKey,
  ...options
}: {
  entryId: string
  target: "content" | "readabilityContent"
  actionLanguage: SupportedActionLanguage
  summaryGenerator?: SummaryGenerator
  summaryGeneratorKey?: string
} & GeneralQueryOptions) {
  const storedSummary = useSummaryStore((state) => {
    return (
      state.data[entryId]?.[actionLanguage]?.[
        target === "content" ? "summary" : "readabilitySummary"
      ] ?? null
    )
  })
  const query = useQuery({
    queryKey: ["summary", entryId, target, actionLanguage, summaryGeneratorKey ?? "remote"],
    queryFn: ({ signal }) => {
      return summarySyncService.generateSummary({
        entryId,
        target,
        actionLanguage,
        generator: summaryGenerator,
        abortSignal: signal,
      })
    },
    enabled: options?.enabled,
    staleTime: 1000 * 60 * 60 * 24,
  })

  const data = query.data ?? storedSummary ?? undefined

  return {
    ...query,
    data,
    isLoading: query.isLoading && !data,
  }
}
