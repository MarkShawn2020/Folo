import { Input } from "@follow/components/ui/input/index.js"
import type { UserRole } from "@follow/constants"
import { UserRolePriority } from "@follow/constants"
import { useUserRole } from "@follow/store/user/hooks"
import { cn } from "@follow/utils"
import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"
import { useSettingModal } from "~/modules/settings/modal/use-setting-modal-hack"

import { useAIModel } from "../../hooks/useAIModel"

interface AIModelIndicatorProps {
  className?: string
  onModelChange?: (model: string) => void
}

interface AIModelMenuItem {
  label: string
  value?: string
  paidLevel?: string
}

interface RenderAIModelMenuItem extends AIModelMenuItem {
  menuKey: string
}

type ProviderType =
  | "openai"
  | "google"
  | "auto"
  | "deepseek"
  | "anthropic"
  | "moonshotai"
  | "openrouter"
  | "vercel-ai-gateway"
  | "zenmux"

const providerIcons: Record<ProviderType, string> = {
  auto: "i-mgc-folo-bot-original size-4 -ml-0.5",
  openai: "i-mgc-openai-original",
  google: "i-simple-icons-googlegemini",
  anthropic: "i-simple-icons-claude",
  deepseek: "i-mgc-deepseek-original",
  moonshotai: "i-mgc-moonshotai-original",
  openrouter: "i-mgc-route-cute-re",
  "vercel-ai-gateway": "i-mgc-link-cute-re",
  zenmux: "i-mgc-link-cute-re",
}

const MODEL_PAID_LEVELS = ["basic", "plus", "pro"] as const
type ModelPaidLevel = (typeof MODEL_PAID_LEVELS)[number]

const paidLevelPriority: Record<ModelPaidLevel, number> = {
  basic: 1,
  plus: 2,
  pro: 3,
}

const paidLevelBadgeStyles: Record<ModelPaidLevel, string> = {
  basic: "border-green/30 bg-green/10 text-green",
  plus: "border-blue/30 bg-blue/10 text-blue",
  pro: "border-purple/40 bg-purple/10 text-purple",
}

const paidLevelLabels: Record<ModelPaidLevel, string> = {
  basic: "Basic",
  plus: "Plus",
  pro: "Pro",
}

const isModelPaidLevel = (value: unknown): value is ModelPaidLevel => {
  return typeof value === "string" && MODEL_PAID_LEVELS.includes(value as ModelPaidLevel)
}

const hasAccessToPaidLevel = (role: UserRole | null | undefined, level?: ModelPaidLevel) => {
  if (!level) return true
  const roleScore = role ? (UserRolePriority[role] ?? 0) : 0
  return roleScore >= paidLevelPriority[level]
}

const parseModelString = (modelString: string) => {
  if (!modelString || !modelString.includes("/") || modelString === "auto") {
    return { provider: "auto" as ProviderType, modelName: modelString || "Unknown" }
  }

  const [provider, ...modelParts] = modelString.split("/")
  const modelName = modelParts.join("/")

  return {
    provider: (provider as ProviderType) || "auto",
    modelName: modelName || "Unknown",
  }
}

const getModelSearchText = (label: string, value: string) => {
  const { provider, modelName } = parseModelString(value)
  return `${label} ${value} ${provider} ${modelName}`.toLowerCase()
}

const createMenuKeyFactory = (prefix: string) => {
  const counts = new Map<string, number>()

  return (item: AIModelMenuItem) => {
    const baseKey = item.value ? `model:${item.value}` : `section:${item.label}`
    const count = counts.get(baseKey) ?? 0
    counts.set(baseKey, count + 1)

    return count === 0 ? `${prefix}:${baseKey}` : `${prefix}:${baseKey}:${count}`
  }
}

export const AIModelIndicator = memo(({ className, onModelChange }: AIModelIndicatorProps) => {
  const { data, changeModel } = useAIModel()
  const {
    defaultModel,
    availableModels = [],
    currentModel,
    availableModelsMenu = [],
    isByok,
    recentModels = [],
  } = data || {}
  const role = useUserRole()
  const settingModalPresent = useSettingModal()
  const { t } = useTranslation("ai")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState("")
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)

  const { provider, modelName } = useMemo(() => {
    return parseModelString(currentModel || defaultModel || "")
  }, [currentModel, defaultModel])

  const selectedMenuItem = useMemo(() => {
    return availableModelsMenu.find((item) => item.value === currentModel)
  }, [availableModelsMenu, currentModel])

  const iconClass = providerIcons[provider] || providerIcons.auto
  const hasMultipleModels = availableModels && availableModels.length > 1
  const canOpenModelMenu = isByok
    ? availableModelsMenu.some((item) => !!item.value)
    : hasMultipleModels
  const normalizedModelSearchQuery = modelSearchQuery.trim().toLowerCase()
  const baseModelsMenu = useMemo(() => {
    const createMenuKey = createMenuKeyFactory("all")

    return availableModelsMenu.map(
      (item): RenderAIModelMenuItem => ({
        ...item,
        menuKey: createMenuKey(item),
      }),
    )
  }, [availableModelsMenu])
  const menuItemByValue = useMemo(() => {
    const map = new Map<string, RenderAIModelMenuItem>()
    for (const item of baseModelsMenu) {
      if (item.value && !map.has(item.value)) {
        map.set(item.value, item)
      }
    }
    return map
  }, [baseModelsMenu])
  const recentModelsMenu = useMemo(() => {
    const recentItems = recentModels.flatMap((model) => {
      const item = menuItemByValue.get(model)
      return item
        ? [
            {
              ...item,
              menuKey: `recent:model:${model}`,
            },
          ]
        : []
    })

    if (recentItems.length === 0) {
      return []
    }

    return [
      { label: t("model_menu.recent"), menuKey: "recent:section" },
      ...recentItems,
    ] satisfies RenderAIModelMenuItem[]
  }, [menuItemByValue, recentModels, t])
  const recentModelValues = useMemo(() => {
    return new Set(recentModelsMenu.flatMap((item) => (item.value ? [item.value] : [])))
  }, [recentModelsMenu])
  const baseModelsMenuWithoutRecent = useMemo(() => {
    if (recentModelValues.size === 0) {
      return baseModelsMenu
    }

    const nextMenu: RenderAIModelMenuItem[] = []
    let pendingSectionItem: RenderAIModelMenuItem | null = null

    for (const item of baseModelsMenu) {
      if (!item.value) {
        pendingSectionItem = item
        continue
      }

      if (recentModelValues.has(item.value)) {
        continue
      }

      if (pendingSectionItem) {
        nextMenu.push(pendingSectionItem)
        pendingSectionItem = null
      }

      nextMenu.push(item)
    }

    return nextMenu
  }, [baseModelsMenu, recentModelValues])
  const modelsMenu = useMemo(() => {
    if (normalizedModelSearchQuery || recentModelsMenu.length === 0) {
      return baseModelsMenu
    }

    return [...recentModelsMenu, ...baseModelsMenuWithoutRecent]
  }, [baseModelsMenu, baseModelsMenuWithoutRecent, normalizedModelSearchQuery, recentModelsMenu])
  const filteredModelsMenu = useMemo(() => {
    if (!normalizedModelSearchQuery) {
      return modelsMenu
    }

    const nextMenu: typeof modelsMenu = []
    let pendingSectionItems: typeof modelsMenu = []

    for (const item of modelsMenu) {
      if (!item.value) {
        pendingSectionItems = [item]
        continue
      }

      const searchText = getModelSearchText(item.label, item.value)
      if (!searchText.includes(normalizedModelSearchQuery)) {
        continue
      }

      if (pendingSectionItems.length > 0) {
        nextMenu.push(...pendingSectionItems)
        pendingSectionItems = []
      }
      nextMenu.push(item)
    }

    return nextMenu
  }, [modelsMenu, normalizedModelSearchQuery])
  const hasSearchResults = filteredModelsMenu.some((item) => !!item.value)

  useEffect(() => {
    if (!isModelMenuOpen) {
      return
    }

    const frameId = requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => cancelAnimationFrame(frameId)
  }, [isModelMenuOpen])

  const modelContent = (
    <div
      className={cn(
        "inline-flex shrink-0 items-center rounded-xl border font-medium backdrop-blur-sm transition-colors",
        canOpenModelMenu ? "cursor-button hover:bg-material-medium" : "hover:bg-material-medium/50",
        "duration-200",
        "gap-1.5 p-1 text-xs",
        canOpenModelMenu && "px-2",
        "border-border/50 bg-material-ultra-thin",
        "text-text-secondary",

        className,
      )}
    >
      <i className={cn("size-3", iconClass)} />
      <span className="hidden max-w-20 truncate @md:inline">
        {selectedMenuItem?.label || modelName}
      </span>
      {canOpenModelMenu && <i className="i-mingcute-down-line size-3 opacity-60" />}
    </div>
  )

  if (!canOpenModelMenu) {
    return modelContent
  }

  return (
    <DropdownMenu
      open={isModelMenuOpen}
      onOpenChange={(open) => {
        setIsModelMenuOpen(open)
        if (!open) {
          setModelSearchQuery("")
        }
      }}
    >
      <DropdownMenuTrigger asChild>{modelContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)] p-0">
        <div className="border-b border-border/50 p-1.5">
          <div className="relative">
            <i className="i-mgc-search-2-cute-re pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-quaternary" />
            <Input
              ref={searchInputRef}
              value={modelSearchQuery}
              placeholder={t("model_menu.search_placeholder")}
              className="h-7 rounded-[5px] border-transparent bg-fill-secondary pl-7 pr-2 text-xs shadow-none"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== "Escape") {
                  event.stopPropagation()
                }
              }}
              onChange={(event) => setModelSearchQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-1">
          {hasSearchResults ? (
            filteredModelsMenu.map(({ label, value, paidLevel, menuKey }, index) => {
              if (value) {
                const { provider: itemProvider, modelName: itemModelName } = parseModelString(value)
                const itemIconClass = providerIcons[itemProvider] || providerIcons.auto
                const isSelected = value === (currentModel || defaultModel)
                const normalizedPaidLevel = isModelPaidLevel(paidLevel) ? paidLevel : undefined
                const requiresUpgrade = !hasAccessToPaidLevel(role, normalizedPaidLevel)

                const handleModelSelect = () => {
                  if (requiresUpgrade) {
                    settingModalPresent("plan")
                    return
                  }
                  changeModel(value)
                  onModelChange?.(value)
                }

                return (
                  <DropdownMenuItem
                    key={menuKey}
                    className={cn("gap-2", requiresUpgrade && "text-text-secondary")}
                    onClick={handleModelSelect}
                    checked={isSelected}
                  >
                    <i className={cn("size-3", itemIconClass)} />
                    <span className="truncate">{label || itemModelName}</span>
                    {normalizedPaidLevel && (
                      <span
                        className={cn(
                          "ml-auto inline-flex rounded-full border px-1.5 text-[9px] font-semibold uppercase tracking-wide",
                          paidLevelBadgeStyles[normalizedPaidLevel],
                        )}
                      >
                        {paidLevelLabels[normalizedPaidLevel]}
                      </span>
                    )}
                  </DropdownMenuItem>
                )
              } else {
                return (
                  <Fragment key={menuKey}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{label}</DropdownMenuLabel>
                  </Fragment>
                )
              }
            })
          ) : (
            <div className="px-2.5 py-6 text-center text-xs text-text-tertiary">
              {t("model_menu.no_results")}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

AIModelIndicator.displayName = "AIModelIndicator"
