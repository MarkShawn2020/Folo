import type { UserByokProviderRequestConfig } from "@follow/shared/settings/byok"
import { normalizeOpenAICompatibleBaseURL } from "@follow/shared/settings/byok"
import type { BizUIMetadata } from "@folo-services/ai-tools"
import type { ChatTransport, FinishReason, UIMessageChunk } from "ai"

import type { BizUIMessage } from "./types"

type OpenAIChatRole = "system" | "user" | "assistant"

export type OpenAIChatMessage = {
  role: OpenAIChatRole
  content: string
}

type OpenAIUsage = {
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  completion_tokens_details?: {
    reasoning_tokens?: number
  }
}

type OpenAIStreamChunk = {
  model?: string
  choices?: {
    delta?: {
      content?: string | null
      reasoning_content?: string | null
    }
    finish_reason?: string | null
  }[]
  usage?: OpenAIUsage
  error?: {
    message?: string
    type?: string
    code?: string | number
  }
}

type OpenAIChatCompletionResponse = {
  model?: string
  choices?: {
    message?: {
      content?: string | null
    }
  }[]
  error?: {
    message?: string
    type?: string
    code?: string | number
  }
}

const TEXT_PART_ID = "text-1"

const getChatCompletionsURL = (baseURL: string) => {
  const normalizedBaseURL = normalizeOpenAICompatibleBaseURL(baseURL)
  return `${normalizedBaseURL}/chat/completions`
}

const toOpenAIRole = (role: BizUIMessage["role"]): OpenAIChatRole => {
  switch (role) {
    case "system": {
      return "system"
    }
    case "assistant": {
      return "assistant"
    }
    default: {
      return "user"
    }
  }
}

const getMessagePartText = (part: BizUIMessage["parts"][number]) => {
  if (part.type === "text") {
    return part.text
  }

  if (part.type === "data-rich-text") {
    return part.data.text
  }

  return null
}

const toOpenAIChatMessages = (messages: BizUIMessage[], systemPrompt?: string) => {
  const openAIMessages: OpenAIChatMessage[] = []
  const normalizedSystemPrompt = systemPrompt?.trim()

  if (normalizedSystemPrompt) {
    openAIMessages.push({
      role: "system",
      content: normalizedSystemPrompt,
    })
  }

  for (const message of messages) {
    const content = message.parts
      .map((part) => getMessagePartText(part))
      .filter((text): text is string => !!text?.trim())
      .join("\n\n")
      .trim()

    if (!content) {
      continue
    }

    openAIMessages.push({
      role: toOpenAIRole(message.role),
      content,
    })
  }

  return openAIMessages
}

const normalizeFinishReason = (finishReason?: string | null): FinishReason => {
  switch (finishReason) {
    case "stop": {
      return "stop"
    }
    case "length": {
      return "length"
    }
    case "content_filter": {
      return "content-filter"
    }
    case "tool_calls": {
      return "tool-calls"
    }
    default: {
      return "other"
    }
  }
}

const createMessageMetadata = (
  provider: UserByokProviderRequestConfig,
  model: string,
  modelUsed?: string,
  usage?: OpenAIUsage,
): BizUIMetadata => ({
  finishTime: new Date().toISOString(),
  providerType: "byok",
  provider: provider.provider,
  modelUsed: modelUsed || model,
  ...(usage?.total_tokens ? { totalTokens: usage.total_tokens } : {}),
  ...(usage?.prompt_tokens ? { contextTokens: usage.prompt_tokens } : {}),
  ...(usage?.completion_tokens ? { outputTokens: usage.completion_tokens } : {}),
  ...(usage?.completion_tokens_details?.reasoning_tokens
    ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
    : {}),
})

const getOpenAIStreamErrorMessage = (chunk: OpenAIStreamChunk) => {
  if (!chunk.error) {
    return null
  }

  const { message, type, code } = chunk.error
  return [message, type, code ? `code: ${code}` : null].filter(Boolean).join(" ")
}

const getOpenAIResponseErrorMessage = (payload: OpenAIChatCompletionResponse) => {
  if (!payload.error) {
    return null
  }

  const { message, type, code } = payload.error
  return [message, type, code ? `code: ${code}` : null].filter(Boolean).join(" ")
}

const parseOpenAIStreamChunk = (value: string): OpenAIStreamChunk | null => {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null ? (parsed as OpenAIStreamChunk) : null
  } catch {
    return null
  }
}

const createOpenAIUIMessageStream = ({
  stream,
  provider,
  model,
  onValue,
}: {
  stream: ReadableStream<Uint8Array>
  provider: UserByokProviderRequestConfig
  model: string
  onValue?: (value: UIMessageChunk) => void
}) => {
  const decoder = new TextDecoder()
  let buffer = ""
  let modelUsed: string | undefined
  let usage: OpenAIUsage | undefined
  let finishReason: FinishReason = "stop"

  const emit = (
    controller: TransformStreamDefaultController<UIMessageChunk>,
    chunk: UIMessageChunk,
  ) => {
    onValue?.(chunk)
    controller.enqueue(chunk)
  }

  const handleDataLine = (
    controller: TransformStreamDefaultController<UIMessageChunk>,
    line: string,
  ) => {
    if (!line.startsWith("data:")) {
      return
    }

    const data = line.slice("data:".length).trim()
    if (!data || data === "[DONE]") {
      return
    }

    const parsedChunk = parseOpenAIStreamChunk(data)
    if (!parsedChunk) {
      return
    }

    const errorMessage = getOpenAIStreamErrorMessage(parsedChunk)
    if (errorMessage) {
      throw new Error(errorMessage)
    }

    if (parsedChunk.model) {
      modelUsed = parsedChunk.model
    }
    if (parsedChunk.usage) {
      usage = parsedChunk.usage
    }

    const choice = parsedChunk.choices?.[0]
    if (choice?.finish_reason) {
      finishReason = normalizeFinishReason(choice.finish_reason)
    }

    const content = choice?.delta?.content
    if (content) {
      emit(controller, { type: "text-delta", id: TEXT_PART_ID, delta: content })
    }
  }

  return stream.pipeThrough(
    new TransformStream<Uint8Array, UIMessageChunk>({
      start(controller) {
        emit(controller, { type: "start" })
        emit(controller, { type: "start-step" })
        emit(controller, { type: "text-start", id: TEXT_PART_ID })
      },
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })

        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          handleDataLine(controller, line)
        }
      },
      flush(controller) {
        buffer += decoder.decode()
        if (buffer) {
          for (const line of buffer.split(/\r?\n/)) {
            handleDataLine(controller, line)
          }
        }

        emit(controller, { type: "text-end", id: TEXT_PART_ID })
        emit(controller, { type: "finish-step" })
        emit(controller, {
          type: "finish",
          finishReason,
          messageMetadata: createMessageMetadata(provider, model, modelUsed, usage),
        })
      },
    }),
  )
}

export const fetchByokChatCompletion = async ({
  provider,
  model,
  messages,
  abortSignal,
}: {
  provider: UserByokProviderRequestConfig
  model: string
  messages: OpenAIChatMessage[]
  abortSignal?: AbortSignal
}) => {
  if (!provider.baseURL) {
    throw new Error(`BYOK provider ${provider.provider} requires an OpenAI-compatible base URL.`)
  }

  const headers = new Headers(provider.headers)
  headers.set("Authorization", `Bearer ${provider.apiKey}`)
  headers.set("Content-Type", "application/json")

  const response = await fetch(getChatCompletionsURL(provider.baseURL), {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...provider.extraBody,
      model,
      messages,
      stream: false,
    }),
    signal: abortSignal,
  })

  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to fetch the BYOK chat response.")
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse
  const errorMessage = getOpenAIResponseErrorMessage(payload)
  if (errorMessage) {
    throw new Error(errorMessage)
  }

  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error("The BYOK chat response did not include any content.")
  }

  return content
}

export const streamByokChatCompletion = async ({
  provider,
  model,
  messages,
  abortSignal,
  onDelta,
}: {
  provider: UserByokProviderRequestConfig
  model: string
  messages: OpenAIChatMessage[]
  abortSignal?: AbortSignal
  onDelta?: (delta: string, content: string) => void
}) => {
  if (!provider.baseURL) {
    throw new Error(`BYOK provider ${provider.provider} requires an OpenAI-compatible base URL.`)
  }

  const headers = new Headers(provider.headers)
  headers.set("Authorization", `Bearer ${provider.apiKey}`)
  headers.set("Content-Type", "application/json")

  const response = await fetch(getChatCompletionsURL(provider.baseURL), {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...provider.extraBody,
      model,
      messages,
      stream: true,
    }),
    signal: abortSignal,
  })

  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to fetch the BYOK chat response.")
  }

  if (!response.body) {
    throw new Error("The BYOK chat response body is empty.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""

  const handleDataLine = (line: string) => {
    if (!line.startsWith("data:")) {
      return
    }

    const data = line.slice("data:".length).trim()
    if (!data || data === "[DONE]") {
      return
    }

    const parsedChunk = parseOpenAIStreamChunk(data)
    if (!parsedChunk) {
      return
    }

    const errorMessage = getOpenAIStreamErrorMessage(parsedChunk)
    if (errorMessage) {
      throw new Error(errorMessage)
    }

    const delta = parsedChunk.choices?.[0]?.delta?.content
    if (!delta) {
      return
    }

    content += delta
    onDelta?.(delta, content)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      handleDataLine(line)
    }
  }

  buffer += decoder.decode()
  if (buffer) {
    for (const line of buffer.split(/\r?\n/)) {
      handleDataLine(line)
    }
  }

  const trimmedContent = content.trim()
  if (!trimmedContent) {
    throw new Error("The BYOK chat response did not include any content.")
  }

  return trimmedContent
}

export class ByokChatTransport implements ChatTransport<BizUIMessage> {
  constructor(
    private options: {
      provider: UserByokProviderRequestConfig
      model: string
      systemPrompt?: string
      onValue?: (value: UIMessageChunk) => void
    },
  ) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<BizUIMessage>["sendMessages"]>[0]) {
    const { provider, model, systemPrompt, onValue } = this.options
    if (!provider.baseURL) {
      throw new Error(`BYOK provider ${provider.provider} requires an OpenAI-compatible base URL.`)
    }

    const openAIMessages = toOpenAIChatMessages(messages, systemPrompt)
    if (openAIMessages.length === 0) {
      throw new Error("No text content to send.")
    }

    const headers = new Headers(provider.headers)
    headers.set("Authorization", `Bearer ${provider.apiKey}`)
    headers.set("Content-Type", "application/json")

    const response = await fetch(getChatCompletionsURL(provider.baseURL), {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...provider.extraBody,
        model,
        messages: openAIMessages,
        stream: true,
      }),
      signal: abortSignal,
    })

    if (!response.ok) {
      throw new Error((await response.text()) || "Failed to fetch the BYOK chat response.")
    }

    if (!response.body) {
      throw new Error("The BYOK chat response body is empty.")
    }

    return createOpenAIUIMessageStream({
      stream: response.body,
      provider,
      model,
      onValue,
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
