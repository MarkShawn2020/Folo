import type { ByokProviderName, UserByokProviderConfig, UserByokSettings } from "./interface"

export const ZENMUX_OPENAI_BASE_URL = "https://zenmux.ai/api/v1"

export const BYOK_PROVIDER_LABELS = {
  openai: "OpenAI",
  google: "Google",
  "vercel-ai-gateway": "Vercel AI Gateway",
  openrouter: "OpenRouter",
  zenmux: "ZenMux",
} as const satisfies Record<ByokProviderName, string>

export const BYOK_PROVIDER_DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  zenmux: ZENMUX_OPENAI_BASE_URL,
} as const satisfies Partial<Record<ByokProviderName, string>>

export const BYOK_PROVIDER_DEFAULT_MODELS = {
  openai: "gpt-5-mini",
  openrouter: "openai/gpt-5-mini",
  zenmux: "zenmux/auto",
} as const satisfies Partial<Record<ByokProviderName, string>>

export const BYOK_PROVIDER_OPTIONS = Object.entries(BYOK_PROVIDER_LABELS).map(([value, label]) => ({
  value: value as ByokProviderName,
  label,
  defaultBaseURL: BYOK_PROVIDER_DEFAULT_BASE_URLS[value as ByokProviderName],
  defaultModel: BYOK_PROVIDER_DEFAULT_MODELS[value as ByokProviderName],
}))

export type UserByokProviderRequestConfig = {
  provider: ByokProviderName
  apiKey: string
  baseURL?: string
  model?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
}

export type UserByokRequestPayload = {
  enabled: true
  providers: UserByokProviderRequestConfig[]
}

export const getByokProviderDefaultBaseURL = (provider: ByokProviderName) =>
  BYOK_PROVIDER_DEFAULT_BASE_URLS[provider]

export const getByokProviderDefaultModel = (provider: ByokProviderName) =>
  BYOK_PROVIDER_DEFAULT_MODELS[provider]

export const normalizeOpenAICompatibleBaseURL = (baseURL: string) => {
  return baseURL.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "")
}

export const getByokProviderModelSelectorValue = (
  provider: Pick<UserByokProviderRequestConfig, "provider" | "model">,
) => {
  const model = provider.model?.trim() || getByokProviderDefaultModel(provider.provider)

  if (!model) {
    return provider.provider
  }

  return `${provider.provider}/${model}`
}

const normalizeHeaders = (headers?: Record<string, string>) => {
  if (!headers) return

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  )

  return Object.keys(normalizedHeaders).length > 0 ? normalizedHeaders : undefined
}

export const normalizeByokProviderConfig = (
  provider: UserByokProviderConfig,
): UserByokProviderRequestConfig | null => {
  const apiKey = provider.apiKey?.trim()
  if (!apiKey) {
    return null
  }

  const baseURL = provider.baseURL?.trim() || getByokProviderDefaultBaseURL(provider.provider)
  const model = provider.model?.trim() || getByokProviderDefaultModel(provider.provider)
  const headers = normalizeHeaders(provider.headers)

  return {
    provider: provider.provider,
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(model ? { model } : {}),
    ...(headers ? { headers } : {}),
    ...(provider.extraBody ? { extraBody: provider.extraBody } : {}),
  }
}

export const createByokRequestPayload = (
  settings?: UserByokSettings | null,
): UserByokRequestPayload | null => {
  if (!settings?.enabled) {
    return null
  }

  const providers = settings.providers
    .map((provider) => normalizeByokProviderConfig(provider))
    .filter((provider): provider is UserByokProviderRequestConfig => provider !== null)

  return providers.length > 0
    ? {
        enabled: true,
        providers,
      }
    : null
}
