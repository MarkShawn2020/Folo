import { getStorageNS } from "@follow/utils/ns"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

import { createAtomHooks } from "~/lib/jotai"

// Edit state management for messages
export const [, , useEditingMessageId, useSetEditingMessageId, , setEditingMessageId] =
  createAtomHooks(atom<string | null>(null))

// AI Model persistence
export interface AIModelState {
  selectedModel: string | null
  recentModels: string[]
}

const MAX_RECENT_AI_MODELS = 5

const aiModelInitialState: AIModelState = {
  selectedModel: null,
  recentModels: [],
}

export const [, , useAIModelState, useSetAIModelState, getAIModelState, setAIModelState] =
  createAtomHooks<AIModelState>(
    atomWithStorage(getStorageNS("ai-chat-model"), aiModelInitialState, undefined, {
      getOnInit: true,
    }),
  )

const normalizeRecentAIModels = (models: readonly string[] | undefined) => {
  if (!models?.length) {
    return []
  }

  return Array.from(new Set(models.filter(Boolean))).slice(0, MAX_RECENT_AI_MODELS)
}

export const getNextAIModelState = (
  currentState: Partial<AIModelState> | null | undefined,
  selectedModel: string | null,
  options?: { recordRecent?: boolean },
): AIModelState => {
  const currentRecentModels = normalizeRecentAIModels(currentState?.recentModels)
  const recentModels =
    options?.recordRecent && selectedModel
      ? normalizeRecentAIModels([
          selectedModel,
          ...currentRecentModels.filter((model) => model !== selectedModel),
        ])
      : currentRecentModels

  return {
    selectedModel,
    recentModels,
  }
}

export const setAIModelSelectedModel = (
  selectedModel: string | null,
  options?: { recordRecent?: boolean },
) => {
  setAIModelState(getNextAIModelState(getAIModelState(), selectedModel, options))
}
