import { env } from "@follow/shared/env.desktop"
import type { UserByokProviderRequestConfig } from "@follow/shared/settings/byok"
import { createByokRequestPayload, getByokProviderDefaultModel } from "@follow/shared/settings/byok"
import type { ChatTransport, HttpChatTransportInitOptions, UIMessageChunk } from "ai"
import { HttpChatTransport, parseJsonEventStream, uiMessageChunkSchema } from "ai"

import { getAISettings } from "~/atoms/settings/ai"

import { getAIModelState } from "../atoms/session"
import { AIPersistService } from "../services"
import { ByokChatTransport } from "./byok-transport"
import type { BizUIMessage } from "./types"

type TitleHandlerPersistOption = boolean | ((title: string) => void | Promise<void>)

export interface TitleHandlerOptions {
  chatId?: string
  shouldHandle?: () => boolean
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export interface CreateChatTransportOptions {
  onValue?: (value: UIMessageChunk) => void
  titleHandler?: TitleHandlerOptions
}

export interface CreateChatTitleHandlerOptions {
  chatId: string
  getActiveChatId: () => string | null | undefined
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export function createChatTitleHandler(
  options: CreateChatTitleHandlerOptions,
): TitleHandlerOptions {
  const { chatId, getActiveChatId, onTitleChange, persist } = options

  return {
    chatId,
    persist,
    onTitleChange,
    shouldHandle: () => getActiveChatId() === chatId,
  }
}

const OPENAI_MODEL_PREFIX = "openai/"

export const selectByokProvider = (
  providers: UserByokProviderRequestConfig[],
  selectedModel?: string | null,
) => {
  const openAICompatibleProviders = providers.filter((provider) => !!provider.baseURL)
  if (openAICompatibleProviders.length === 0) {
    return null
  }

  if (selectedModel && selectedModel !== "auto") {
    const selectedModelProvider = selectedModel.split("/")[0]
    const matchingProvider = openAICompatibleProviders.find(
      (provider) => provider.provider === selectedModelProvider,
    )
    if (matchingProvider) {
      return matchingProvider
    }
  }

  return (
    openAICompatibleProviders.find((provider) => provider.provider === "zenmux") ??
    openAICompatibleProviders[0] ??
    null
  )
}

export const resolveByokModel = (
  provider: UserByokProviderRequestConfig,
  selectedModel?: string | null,
) => {
  const defaultModel = getByokProviderDefaultModel(provider.provider)
  const providerModelPrefix = `${provider.provider}/`

  if (selectedModel?.startsWith(providerModelPrefix)) {
    return selectedModel.slice(providerModelPrefix.length)
  }

  if (provider.model) {
    return provider.model
  }

  if (!selectedModel || selectedModel === "auto") {
    return defaultModel ?? "gpt-5-mini"
  }

  if (provider.provider === "openai") {
    return selectedModel.startsWith(OPENAI_MODEL_PREFIX)
      ? selectedModel.slice(OPENAI_MODEL_PREFIX.length)
      : (defaultModel ?? selectedModel)
  }

  return selectedModel
}

/**
 * Create a chat transport for AI SDK
 * This is used by the AbstractChat instance to communicate with AI providers
 */
export function createChatTransport(options: CreateChatTransportOptions = {}) {
  return new DynamicChatTransport(options)
}

const createActiveChatTransport = ({ onValue, titleHandler }: CreateChatTransportOptions) => {
  const modelState = getAIModelState()
  const { selectedModel } = modelState
  const aiSettings = getAISettings()
  const byok = createByokRequestPayload(aiSettings.byok)
  const byokProvider = byok ? selectByokProvider(byok.providers, selectedModel) : null

  if (byokProvider) {
    return new ByokChatTransport({
      provider: byokProvider,
      model: resolveByokModel(byokProvider, selectedModel),
      systemPrompt: aiSettings.personalizePrompt,
      onValue,
    })
  }

  return createRemoteChatTransport({ onValue, titleHandler })
}

const createRemoteChatTransport = ({ onValue, titleHandler }: CreateChatTransportOptions) =>
  new ExtendChatTransport({
    onValue,
    titleHandler,
    // Custom fetch configuration
    api: `${env.VITE_API_URL}/ai/chat`,
    credentials: "include",
    // Add selected model to request body
    body: () => {
      const modelState = getAIModelState()
      const { selectedModel } = modelState
      const byok = createByokRequestPayload(getAISettings().byok)

      return {
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(byok ? { byok } : {}),
      }
    },
  })

type UIMessageChunkParseResult =
  ReturnType<typeof parseJsonEventStream<UIMessageChunk>> extends ReadableStream<infer T>
    ? T
    : never

const coerceFinishChunk = (chunk: UIMessageChunkParseResult): UIMessageChunk | null => {
  const { rawValue } = chunk
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null
  }

  if ((rawValue as { type?: unknown }).type !== "finish") {
    return null
  }

  const { finishReason, messageMetadata } = rawValue as {
    finishReason?: unknown
    messageMetadata?: unknown
  }

  return {
    type: "finish",
    finishReason: typeof finishReason === "string" ? finishReason : undefined,
    messageMetadata,
  } as UIMessageChunk
}

class DynamicChatTransport implements ChatTransport<BizUIMessage> {
  constructor(private options: CreateChatTransportOptions) {}

  sendMessages(options: Parameters<ChatTransport<BizUIMessage>["sendMessages"]>[0]) {
    return createActiveChatTransport(this.options).sendMessages(options)
  }

  reconnectToStream(options: Parameters<ChatTransport<BizUIMessage>["reconnectToStream"]>[0]) {
    return createRemoteChatTransport(this.options).reconnectToStream(options)
  }
}

class ExtendChatTransport extends HttpChatTransport<BizUIMessage> {
  constructor(
    private options: HttpChatTransportInitOptions<BizUIMessage> & {
      onValue?: (value: UIMessageChunk) => void
      titleHandler?: TitleHandlerOptions
    },
  ) {
    super(options)
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    const { onValue } = this.options || {}
    const handleGeneratedTitle = this.handleGeneratedTitle.bind(this)
    return parseJsonEventStream({
      stream,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<UIMessageChunkParseResult, UIMessageChunk>({
        async transform(chunk, controller) {
          const parsedChunk = chunk.success ? chunk.value : coerceFinishChunk(chunk)
          if (!parsedChunk) {
            throw chunk.error
          }

          await handleGeneratedTitle(parsedChunk)
          onValue?.(parsedChunk)
          controller.enqueue(parsedChunk)
        },
      }),
    )
  }

  private async handleGeneratedTitle(chunk: UIMessageChunk) {
    const { titleHandler } = this.options
    if (!titleHandler) {
      return
    }

    if (chunk.type !== "data-generated-title" || typeof chunk.data !== "string") {
      return
    }

    const shouldHandle = titleHandler.shouldHandle?.() ?? true
    if (!shouldHandle) {
      return
    }

    titleHandler.onTitleChange?.(chunk.data)

    const persistOption = titleHandler.persist
    const shouldPersist = persistOption === undefined ? true : persistOption

    if (!shouldPersist) {
      return
    }

    try {
      if (typeof persistOption === "function") {
        await persistOption(chunk.data)
        return
      }

      if (titleHandler.chatId) {
        await AIPersistService.updateSessionTitle(titleHandler.chatId, chunk.data)
      }
    } catch (error) {
      console.error("Failed to persist generated title:", error)
    }
  }

  override reconnectToStream(
    options: Parameters<HttpChatTransport<BizUIMessage>["reconnectToStream"]>[0],
  ) {
    options.chatId = encodeURIComponent(options.chatId)
    return super.reconnectToStream(options)
  }
}
