import { ACTION_LANGUAGE_MAP } from "@follow/shared"
import { createByokRequestPayload } from "@follow/shared/settings/byok"
import type { SummaryGenerator } from "@follow/store/summary/store"
import { useMemo } from "react"

import { useAISettingKey } from "~/atoms/settings/ai"

import { useAIModelState } from "../atoms/session"
import { streamByokChatCompletion } from "../store/byok-transport"
import { resolveByokModel, selectByokProvider } from "../store/transport"

const MAX_SUMMARY_SOURCE_LENGTH = 24_000

const normalizeSummarySourceText = (source: string) => {
  const withoutInvisibleContent = source
    .replaceAll(/<script[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, " ")
    .replaceAll(/<noscript[\s\S]*?<\/noscript>/gi, " ")

  const text =
    typeof DOMParser === "undefined"
      ? withoutInvisibleContent.replaceAll(/<[^>]+>/g, " ")
      : new DOMParser().parseFromString(withoutInvisibleContent, "text/html").body.textContent ||
        withoutInvisibleContent

  return text.replaceAll(/\s+/g, " ").trim().slice(0, MAX_SUMMARY_SOURCE_LENGTH)
}

const createSummaryUserPrompt = ({
  title,
  source,
  language,
}: {
  title?: string | null
  source: string
  language: string
}) =>
  [
    "Summarize the following article for an RSS reader.",
    `Output language: ${language}.`,
    "Return only the summary in Markdown. Keep it concise and preserve key facts, names, numbers, and conclusions.",
    title?.trim() ? `Title: ${title.trim()}` : null,
    `Article:\n${source}`,
  ]
    .filter((line): line is string => !!line)
    .join("\n\n")

export const useByokSummaryGenerator = () => {
  const byokSettings = useAISettingKey("byok")
  const modelState = useAIModelState()
  const byok = useMemo(() => createByokRequestPayload(byokSettings), [byokSettings])
  const provider = useMemo(
    () => (byok ? selectByokProvider(byok.providers, modelState.selectedModel) : null),
    [byok, modelState.selectedModel],
  )
  const model = useMemo(
    () => (provider ? resolveByokModel(provider, modelState.selectedModel) : null),
    [provider, modelState.selectedModel],
  )

  const summaryGenerator = useMemo<SummaryGenerator | undefined>(() => {
    if (!provider || !model) {
      return
    }

    return async ({ entry, target, actionLanguage, abortSignal, onSummaryUpdate }) => {
      const source = normalizeSummarySourceText(
        target === "readabilityContent"
          ? entry.readabilityContent || entry.content || entry.description || ""
          : entry.content || entry.description || entry.readabilityContent || "",
      )

      if (!source) {
        return null
      }

      return streamByokChatCompletion({
        provider,
        model,
        abortSignal,
        onDelta: (_delta, summary) => onSummaryUpdate?.(summary),
        messages: [
          {
            role: "system",
            content:
              "You are a precise article summarizer. Do not add commentary, caveats, or information not present in the article.",
          },
          {
            role: "user",
            content: createSummaryUserPrompt({
              title: entry.title,
              source,
              language: ACTION_LANGUAGE_MAP[actionLanguage].label,
            }),
          },
        ],
      })
    }
  }, [model, provider])

  return {
    isByokSummaryEnabled: !!provider,
    summaryGenerator,
    summaryGeneratorKey: provider
      ? `byok:${provider.provider}:${provider.baseURL}:${model}`
      : "remote",
  }
}
