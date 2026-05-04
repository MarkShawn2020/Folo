import { IN_ELECTRON } from "@follow/shared/constants"
import type { UserByokProviderRequestConfig } from "@follow/shared/settings/byok"
import {
  BYOK_PROVIDER_LABELS,
  createByokRequestPayload,
  getByokProviderModelSelectorValue,
  normalizeOpenAICompatibleBaseURL,
  ZENMUX_OPENAI_BASE_URL,
} from "@follow/shared/settings/byok"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { useAISettingKey } from "~/atoms/settings/ai"
import { ipcServices } from "~/lib/client"

import { setAIModelSelectedModel, useAIModelState } from "../atoms/session"
import { useAIConfiguration } from "./useAIConfiguration"

interface AIModelMenuItem {
  label: string
  value?: string
  paidLevel?: string
}

interface ByokModelMenuData {
  defaultModel: string | null
  availableModels: string[]
  availableModelsMenu: AIModelMenuItem[]
}

interface ZenMuxModel {
  id: string
  label: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const parseZenMuxModels = (payload: unknown): ZenMuxModel[] => {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return []
  }

  return payload.data.flatMap((item): ZenMuxModel[] => {
    if (!isRecord(item) || typeof item.id !== "string") {
      return []
    }

    return [
      {
        id: item.id,
        label: typeof item.display_name === "string" ? item.display_name : item.id,
      },
    ]
  })
}

const isLocalDevHost = () => {
  if (typeof window === "undefined") {
    return false
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
}

const getZenMuxModelsURL = (provider: UserByokProviderRequestConfig) => {
  const baseURL = normalizeOpenAICompatibleBaseURL(provider.baseURL || ZENMUX_OPENAI_BASE_URL)

  if (baseURL === ZENMUX_OPENAI_BASE_URL && isLocalDevHost()) {
    return "/__byok/zenmux/models"
  }

  return `${baseURL}/models`
}

const fetchZenMuxModels = async (provider: UserByokProviderRequestConfig) => {
  if (IN_ELECTRON) {
    return parseZenMuxModels(await ipcServices?.app.getZenMuxModels())
  }

  const response = await fetch(getZenMuxModelsURL(provider), {
    headers: provider.headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ZenMux models (${response.status})`)
  }

  return parseZenMuxModels(await response.json())
}

const createFallbackProviderModelMenuItem = (
  provider: UserByokProviderRequestConfig,
): AIModelMenuItem => {
  const value = getByokProviderModelSelectorValue(provider)
  const modelLabel = provider.model || value

  return {
    label: `${BYOK_PROVIDER_LABELS[provider.provider]} · ${modelLabel}`,
    value,
  }
}

const createZenMuxModelMenuItems = (
  provider: UserByokProviderRequestConfig,
  models: ZenMuxModel[] | undefined,
): AIModelMenuItem[] => {
  const fallbackItem = createFallbackProviderModelMenuItem(provider)
  if (!models?.length) {
    return [fallbackItem]
  }

  const modelItems = models.map(
    (model): AIModelMenuItem => ({
      label: model.label,
      value: getByokProviderModelSelectorValue({
        provider: "zenmux",
        model: model.id,
      }),
    }),
  )

  const hasFallbackModel = modelItems.some((item) => item.value === fallbackItem.value)
  return [
    { label: BYOK_PROVIDER_LABELS.zenmux },
    ...(hasFallbackModel ? [] : [fallbackItem]),
    ...modelItems,
  ]
}

const createByokModelMenuData = (
  providers: UserByokProviderRequestConfig[],
  zenmuxModels: ZenMuxModel[] | undefined,
): ByokModelMenuData => {
  const availableModelsMenu = providers.flatMap((provider): AIModelMenuItem[] => {
    if (provider.provider === "zenmux") {
      return createZenMuxModelMenuItems(provider, zenmuxModels)
    }

    return [createFallbackProviderModelMenuItem(provider)]
  })

  const availableModels = availableModelsMenu.flatMap((item) => (item.value ? [item.value] : []))

  return {
    defaultModel: availableModels[0] ?? null,
    availableModels,
    availableModelsMenu,
  }
}

export const useAIModel = () => {
  const { data: configuration, isLoading } = useAIConfiguration()
  const byokSettings = useAISettingKey("byok")
  const modelState = useAIModelState()
  const byok = useMemo(() => createByokRequestPayload(byokSettings), [byokSettings])
  const zenmuxProvider = useMemo(
    () => byok?.providers.find((provider) => provider.provider === "zenmux") ?? null,
    [byok],
  )
  const zenmuxModelsQuery = useQuery({
    queryKey: ["ai", "byok", "models", "zenmux", zenmuxProvider?.baseURL],
    queryFn: () => {
      if (!zenmuxProvider) {
        return Promise.resolve([])
      }

      return fetchZenMuxModels(zenmuxProvider)
    },
    enabled: !!zenmuxProvider,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
  const byokModelData = useMemo(() => {
    if (!byok) {
      return null
    }

    return createByokModelMenuData(byok.providers, zenmuxModelsQuery.data)
  }, [byok, zenmuxModelsQuery.data])

  // Validate and sync persistent model with available models
  useEffect(() => {
    if (byokModelData) {
      const { selectedModel } = modelState
      const { defaultModel, availableModels } = byokModelData

      if (defaultModel && (!selectedModel || !availableModels.includes(selectedModel))) {
        setAIModelSelectedModel(defaultModel)
      }

      return
    }

    if (!configuration || isLoading) return

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = configuration

    // If no model is selected or selected model is not available, use default
    if (!selectedModel || !availableModels.includes(selectedModel)) {
      setAIModelSelectedModel(defaultModel || null)
    }
  }, [byokModelData, configuration, isLoading, modelState])

  // Get current effective model
  const currentModel = useMemo(() => {
    if (byokModelData) {
      const { selectedModel } = modelState
      const { defaultModel, availableModels } = byokModelData

      if (selectedModel && availableModels.includes(selectedModel)) {
        return selectedModel
      }

      return defaultModel
    }

    if (!configuration) return null

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = configuration

    // Return selected model if valid, otherwise fallback to default
    if (selectedModel && availableModels.includes(selectedModel)) {
      return selectedModel
    }

    return defaultModel || null
  }, [byokModelData, configuration, modelState])

  const changeModel = (model: string) => {
    if (byokModelData) {
      if (!byokModelData.availableModels.includes(model)) {
        console.warn(`Model ${model} is not available in current BYOK configuration`)
        return
      }

      setAIModelSelectedModel(model, { recordRecent: true })
      return
    }

    if (!configuration?.availableModels?.includes(model)) {
      console.warn(`Model ${model} is not available in current configuration`)
      return
    }

    setAIModelSelectedModel(model, { recordRecent: true })
  }

  return {
    data: {
      defaultModel: byokModelData?.defaultModel ?? configuration?.defaultModel,
      availableModels: byokModelData?.availableModels ?? configuration?.availableModels,
      availableModelsMenu: byokModelData?.availableModelsMenu ?? configuration?.availableModelsMenu,
      currentModel,
      isByok: !!byokModelData,
      recentModels: modelState.recentModels ?? [],
    },
    isLoading: byokModelData ? false : isLoading,
    changeModel,
  }
}
