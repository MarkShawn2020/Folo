import { Button } from "@follow/components/ui/button/index.js"
import { Tooltip, TooltipContent, TooltipTrigger } from "@follow/components/ui/tooltip/index.jsx"
import type { UserByokProviderConfig } from "@follow/shared/settings/interface"
import { useTranslation } from "react-i18next"

import { BYOK_PROVIDER_LABELS } from "./constants"

interface ByokProviderItemProps {
  provider: UserByokProviderConfig
  onDelete: () => void
  onEdit: () => void
}

export const ByokProviderItem = ({ provider, onEdit, onDelete }: ByokProviderItemProps) => {
  const { t } = useTranslation("ai")

  const providerLabel = BYOK_PROVIDER_LABELS[provider.provider] || provider.provider
  const secondaryLabel = [provider.model, provider.baseURL].filter(Boolean).join(" · ")

  return (
    <div className="group -ml-3 rounded-lg border border-border p-3 transition-colors hover:bg-material-medium">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-text">{providerLabel}</h4>
            <span className="inline-flex rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">
              {t("byok.providers.configured")}
            </span>
          </div>
          {secondaryLabel && (
            <div className="mt-1 truncate text-xs text-text-secondary">{secondaryLabel}</div>
          )}
        </div>

        <div className="ml-4 flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <i className="i-mgc-edit-cute-re size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("byok.providers.edit")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                <i className="i-mgc-delete-2-cute-re size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("byok.providers.delete")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
