import { Button } from "@follow/components/ui/button/index.js"
import { Card, CardContent, CardHeader } from "@follow/components/ui/card/index.jsx"
import { useIsSubscribed } from "@follow/store/subscription/hooks"
import { cn } from "@follow/utils/utils"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { getFetchErrorMessage } from "~/lib/error-parser"
import { useReplaceImgUrlIfNeed } from "~/lib/img-proxy"

import type { XiaohongshuSearchAccount } from "./types"
import {
  getXiaohongshuLocalFeedId,
  importXiaohongshuProfileToLocalFeed,
} from "./xiaohongshu-local-import"

const getErrorMessage = (error: unknown) =>
  getFetchErrorMessage(error instanceof Error ? error : new Error(String(error)))

interface XiaohongshuAccountCardProps {
  account: XiaohongshuSearchAccount
}

export function XiaohongshuAccountCard({ account }: XiaohongshuAccountCardProps) {
  const { t } = useTranslation()
  const replaceImgUrlIfNeed = useReplaceImgUrlIfNeed()
  const feedId = getXiaohongshuLocalFeedId(account.userId)
  const isSubscribed = useIsSubscribed(feedId)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const avatarUrl = replaceImgUrlIfNeed(account.avatar) || account.avatar

  const handleSubscribe = async () => {
    const integrationServices = ipcServices?.integration
    if (!integrationServices || isSubscribed || isSubscribing) return

    setIsSubscribing(true)
    try {
      const profile = await integrationServices.fetchXiaohongshuUserProfile({
        userId: account.userId,
        xsecToken: account.xsecToken,
      })
      const imported = await importXiaohongshuProfileToLocalFeed(profile)
      toast.success(
        t("discover.xiaohongshu.subscribe_success", {
          name: profile.nickname || account.nickname,
          count: imported.entryCount,
        }),
      )
    } catch (error) {
      toast.error(t("discover.xiaohongshu.subscribe_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setIsSubscribing(false)
    }
  }

  return (
    <Card
      data-channel="xiaohongshu"
      data-feed-id={feedId}
      className="overflow-hidden border-fill-secondary bg-material-ultra-thin"
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex min-w-0 items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-11 shrink-0 rounded-xl border border-fill-secondary object-cover"
            />
          ) : (
            <div className="center size-11 shrink-0 rounded-xl bg-fill-secondary text-text-secondary">
              <i className="i-mgc-user-3-cute-re size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-text">{account.nickname}</h3>
              <span className="shrink-0 rounded-full bg-red/10 px-2 py-0.5 text-xs font-medium text-red">
                {t("discover.channels.xiaohongshu.name")}
              </span>
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              {t("discover.xiaohongshu.matched_notes", { count: account.matchedNoteCount })}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {account.sampleTitles.length > 0 && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {account.sampleTitles.slice(0, 2).map((title) => (
              <div
                key={title}
                className="flex min-w-0 items-start gap-2 rounded-lg bg-fill-quaternary px-3 py-2 text-xs text-text-secondary"
              >
                <i className="i-mgc-file-cute-re mt-0.5 shrink-0 text-text-tertiary" />
                <span className="line-clamp-2">{title}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <a
            href={account.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-fill-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <i className="i-mgc-external-link-cute-re size-3.5" />
            {t("discover.xiaohongshu.open_profile")}
          </a>
          <Button
            type="button"
            size="sm"
            variant={isSubscribed ? "outline" : "primary"}
            disabled={isSubscribed}
            isLoading={isSubscribing}
            buttonClassName={cn(isSubscribed && "text-text-secondary")}
            onClick={() => void handleSubscribe()}
          >
            <i
              className={cn(
                "mr-1 size-3.5",
                isSubscribed ? "i-mgc-check-circle-cute-fi" : "i-mgc-add-cute-re",
              )}
            />
            <span>
              {isSubscribed ? t("feed.actions.followed") : t("discover.xiaohongshu.subscribe")}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
