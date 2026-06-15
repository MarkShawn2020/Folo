import { ActionButton } from "@follow/components/ui/button/index.js"
import { Divider } from "@follow/components/ui/divider/index.js"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@follow/components/ui/popover/index.js"
import { ResponsiveSelect } from "@follow/components/ui/select/responsive.js"
import { Switch } from "@follow/components/ui/switch/index.js"
import { ACTION_LANGUAGE_MAP } from "@follow/shared"
import { cn } from "@follow/utils/utils"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  DEFAULT_ACTION_LANGUAGE,
  setGeneralSetting,
  useGeneralSettingKey,
} from "~/atoms/settings/general"
import { defaultResources } from "~/@types/default-resource"
import { setTranslationCache } from "~/modules/entry-content/atoms"

export const TranslationSettingButton = () => {
  const { t } = useTranslation()

  const enabled = useGeneralSettingKey("translation")
  const actionLanguage = useGeneralSettingKey("actionLanguage")
  const translationMode = useGeneralSettingKey("translationMode")

  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ActionButton
          tooltip={t("entry_list_header.translation.label")}
          active={enabled}
          className="relative"
        >
          <i
            className={cn(
              "i-mgc-translate-2-ai-cute-re",
              enabled && "text-accent",
            )}
          />
          {enabled && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_theme(colors.background)]" />
          )}
        </ActionButton>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        {/* Whole row toggles translation; the Switch is a visual indicator
            (pointer-events-none) so clicking the label/description works too. */}
        <div
          role="switch"
          aria-checked={enabled}
          tabIndex={0}
          onClick={() => setGeneralSetting("translation", !enabled)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              setGeneralSetting("translation", !enabled)
            }
          }}
          className="flex cursor-button items-center justify-between gap-2 px-4 pb-3 pt-4 focus-visible:outline-none"
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold leading-tight text-text">
              {t("entry_list_header.translation.label")}
            </span>
            <span className="mt-0.5 truncate text-xs text-text-secondary">
              {t("entry_list_header.translation.description")}
            </span>
          </div>
          <Switch checked={enabled} className="pointer-events-none" />
        </div>

        <Divider className="opacity-60" />

        {/* Always interactive — users can pre-configure language/mode even while
            translation is toggled off. */}
        <div className="flex flex-col gap-4 px-4 pb-4 pt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {t("entry_list_header.translation.target_language")}
            </span>
            <ResponsiveSelect
              size="sm"
              triggerClassName="w-full"
              value={actionLanguage}
              onValueChange={(value) => {
                setGeneralSetting("actionLanguage", value)
                setTranslationCache({})
              }}
              items={[
                {
                  label: t("entry_list_header.translation.default_language"),
                  value: DEFAULT_ACTION_LANGUAGE,
                },
                ...Object.values(ACTION_LANGUAGE_MAP).map((item) => ({
                  label: defaultResources[item.value]?.lang.name ?? item.label,
                  value: item.value,
                })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {t("entry_list_header.translation.mode")}
            </span>
            <ResponsiveSelect
              size="sm"
              triggerClassName="w-full"
              value={translationMode}
              onValueChange={(value) => {
                setGeneralSetting("translationMode", value as "bilingual" | "translation-only")
              }}
              items={[
                {
                  label: t("entry_list_header.translation.bilingual"),
                  value: "bilingual",
                },
                {
                  label: t("entry_list_header.translation.translation_only"),
                  value: "translation-only",
                },
              ]}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
