import { Button } from "@follow/components/ui/button/index.js"
import { Input, TextArea } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@follow/components/ui/select/index.js"
import type { ByokProviderName, UserByokProviderConfig } from "@follow/shared/settings/interface"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  BYOK_PROVIDER_DEFAULT_BASE_URLS,
  BYOK_PROVIDER_DEFAULT_MODELS,
  getByokProviderDefaultBaseURL,
  getByokProviderDefaultModel,
  PROVIDER_OPTIONS,
} from "./constants"

interface ByokProviderModalContentProps {
  provider: UserByokProviderConfig | null
  configuredProviders?: ByokProviderName[]
  onSave: (provider: UserByokProviderConfig) => void
  onCancel: () => void
}

const EMPTY_CONFIGURED_PROVIDERS: ByokProviderName[] = []

const resolveInitialBaseURL = (
  provider: UserByokProviderConfig | null,
  providerName: ByokProviderName,
) => provider?.baseURL ?? getByokProviderDefaultBaseURL(providerName) ?? null

const resolveInitialModel = (
  provider: UserByokProviderConfig | null,
  providerName: ByokProviderName,
) => provider?.model ?? getByokProviderDefaultModel(providerName) ?? null

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const parseExtraBody = (value: string): Record<string, unknown> | undefined => {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return undefined
  }

  const parsed: unknown = JSON.parse(trimmedValue)
  if (!isPlainRecord(parsed)) {
    throw new Error("Extra body must be a JSON object.")
  }
  return parsed
}

export const ByokProviderModalContent = ({
  provider,
  configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
  onSave,
  onCancel,
}: ByokProviderModalContentProps) => {
  const { t } = useTranslation("ai")

  // Filter out already configured providers, but keep the current one if editing
  const availableProviders = PROVIDER_OPTIONS.filter(
    (option) => !configuredProviders.includes(option.value) || option.value === provider?.provider,
  )

  // Get the first available provider or fallback to the current one
  const defaultProvider = availableProviders[0]?.value ?? provider?.provider ?? "openai"

  const [formData, setFormData] = useState<UserByokProviderConfig>(() => ({
    provider: provider?.provider ?? defaultProvider,
    baseURL: resolveInitialBaseURL(provider, provider?.provider ?? defaultProvider),
    model: resolveInitialModel(provider, provider?.provider ?? defaultProvider),
    apiKey: provider?.apiKey ?? null,
    headers: provider?.headers ?? {},
    extraBody: provider?.extraBody,
  }))
  const [extraBodyText, setExtraBodyText] = useState(() =>
    provider?.extraBody ? JSON.stringify(provider.extraBody, null, 2) : "",
  )
  const [extraBodyError, setExtraBodyError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.provider || !formData.apiKey?.trim()) {
      return
    }
    let extraBody: Record<string, unknown> | undefined
    try {
      extraBody = parseExtraBody(extraBodyText)
      setExtraBodyError(null)
    } catch {
      setExtraBodyError(t("byok.providers.form.invalid_json"))
      return
    }

    onSave({
      ...formData,
      apiKey: formData.apiKey.trim(),
      baseURL: formData.baseURL?.trim() || getByokProviderDefaultBaseURL(formData.provider) || null,
      model: formData.model?.trim() || getByokProviderDefaultModel(formData.provider) || null,
      extraBody,
    })
  }

  const handleProviderChange = (value: string) => {
    const nextProvider = value as ByokProviderName
    const currentProviderDefault = getByokProviderDefaultBaseURL(formData.provider)
    const currentProviderDefaultModel = getByokProviderDefaultModel(formData.provider)
    const shouldApplyDefaultBaseURL =
      !formData.baseURL || formData.baseURL === currentProviderDefault
    const shouldApplyDefaultModel =
      !formData.model || formData.model === currentProviderDefaultModel

    setFormData({
      ...formData,
      provider: nextProvider,
      baseURL: shouldApplyDefaultBaseURL
        ? (getByokProviderDefaultBaseURL(nextProvider) ?? null)
        : formData.baseURL,
      model: shouldApplyDefaultModel
        ? (getByokProviderDefaultModel(nextProvider) ?? null)
        : formData.model,
    })
  }

  const selectedProviderDefaultBaseURL = BYOK_PROVIDER_DEFAULT_BASE_URLS[formData.provider]
  const selectedProviderDefaultModel = BYOK_PROVIDER_DEFAULT_MODELS[formData.provider]

  return (
    <form onSubmit={handleSubmit} className="min-w-[40ch] space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider">{t("byok.providers.form.provider")}</Label>
        <Select
          value={formData.provider}
          disabled={availableProviders.length === 0}
          onValueChange={handleProviderChange}
        >
          <SelectTrigger id="provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="baseURL">{t("byok.providers.form.base_url")}</Label>
        <Input
          id="baseURL"
          type="url"
          placeholder={
            selectedProviderDefaultBaseURL ?? t("byok.providers.form.base_url_placeholder")
          }
          value={formData.baseURL ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              baseURL: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.base_url_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">{t("byok.providers.form.model")}</Label>
        <Input
          id="model"
          placeholder={selectedProviderDefaultModel ?? t("byok.providers.form.model_placeholder")}
          value={formData.model ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              model: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.model_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">{t("byok.providers.form.api_key")}</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder={t("byok.providers.form.api_key_placeholder")}
          value={formData.apiKey ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              apiKey: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.api_key_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="extraBody">{t("byok.providers.form.extra_body")}</Label>
        <TextArea
          id="extraBody"
          className="min-h-24 font-mono text-xs"
          placeholder={t("byok.providers.form.extra_body_placeholder")}
          value={extraBodyText}
          onChange={(e) => {
            setExtraBodyText(e.target.value)
            setExtraBodyError(null)
          }}
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.extra_body_help")}</p>
        {extraBodyError && <p className="text-xs text-red">{extraBodyError}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("words.cancel", { ns: "common" })}
        </Button>
        <Button type="submit" disabled={!formData.apiKey?.trim()}>
          {t("words.save", { ns: "common" })}
        </Button>
      </div>
    </form>
  )
}
