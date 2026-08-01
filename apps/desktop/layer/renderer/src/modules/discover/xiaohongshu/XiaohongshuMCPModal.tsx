import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { useReplaceImgUrlIfNeed } from "~/lib/img-proxy"

import { importXiaohongshuProfileToLocalFeed } from "./xiaohongshu-local-import"
import {
  clearCachedXiaohongshuLogin,
  getCachedXiaohongshuLogin,
  setCachedXiaohongshuLogin,
  tryCachedXiaohongshuSearch,
} from "./xiaohongshu-login-cache"
import {
  addAccountTask,
  getAccountSubscriptionState,
  removeAccountTask,
} from "./xiaohongshu-subscription-state"

interface XiaohongshuSearchAccount {
  userId: string
  nickname: string
  avatar: string
  profileUrl: string
  xsecToken: string
  matchedNoteCount: number
  sampleTitles: string[]
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function XiaohongshuMCPModal() {
  const { t } = useTranslation()
  const replaceImgUrlIfNeed = useReplaceImgUrlIfNeed()
  const [keywords, setKeywords] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [accounts, setAccounts] = useState<XiaohongshuSearchAccount[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [subscribingUserIds, setSubscribingUserIds] = useState(() => new Set<string>())
  const [subscribedUserIds, setSubscribedUserIds] = useState(() => new Set<string>())
  const [loginQRCode, setLoginQRCode] = useState("")
  const [loginUsername, setLoginUsername] = useState(
    () => getCachedXiaohongshuLogin({})?.username ?? "",
  )
  const [pendingKeywords, setPendingKeywords] = useState<string | null>(null)

  const integrationServices = ipcServices?.integration
  const canUseLocalMCP = Boolean(window.electron && integrationServices)

  useEffect(() => {
    const cachedLogin = getCachedXiaohongshuLogin({ endpoint })
    setLoginUsername(cachedLogin?.username ?? "")
  }, [endpoint])

  const runSearch = useCallback(
    async (searchKeywords: string) => {
      if (!integrationServices) return

      const result = await integrationServices.searchXiaohongshuAccounts({
        keywords: searchKeywords,
        endpoint: endpoint.trim() || undefined,
      })
      setAccounts(result.accounts)
      setHasSearched(true)
      if (result.accounts.length === 0) {
        toast.info(t("discover.xiaohongshu.no_results"))
      }
    },
    [endpoint, integrationServices, t],
  )

  useEffect(() => {
    if (!loginQRCode || !pendingKeywords || !integrationServices) return

    let disposed = false
    let isPolling = false
    const pollLoginStatus = async () => {
      if (isPolling) return
      isPolling = true
      try {
        const status = await integrationServices.getXiaohongshuLoginStatus({
          endpoint: endpoint.trim() || undefined,
        })
        if (!status.isLoggedIn || disposed) return

        const searchKeywords = pendingKeywords
        setLoginQRCode("")
        setPendingKeywords(null)
        setLoginUsername(status.username)
        setCachedXiaohongshuLogin({
          endpoint,
          username: status.username,
          userId: status.userId,
        })
        toast.success(t("discover.xiaohongshu.login_success"))
        setIsSearching(true)
        try {
          await runSearch(searchKeywords)
        } catch (error) {
          toast.error(t("discover.xiaohongshu.search_failed"), {
            description: getErrorMessage(error),
          })
        } finally {
          setIsSearching(false)
        }
      } catch {
        // The next poll retries transient browser startup and login checks.
      } finally {
        isPolling = false
      }
    }

    void pollLoginStatus()
    const intervalId = window.setInterval(() => void pollLoginStatus(), 2_000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [endpoint, integrationServices, loginQRCode, pendingKeywords, runSearch, t])

  const handleSearch = async () => {
    const trimmedKeywords = keywords.trim()
    if (!trimmedKeywords) {
      toast.error(t("discover.xiaohongshu.keyword_required"))
      return
    }
    if (!integrationServices) {
      toast.error(t("discover.xiaohongshu.desktop_only"))
      return
    }

    const cachedLogin = getCachedXiaohongshuLogin({ endpoint })
    setIsSearching(true)
    setIsPreparing(!cachedLogin)
    setAccounts([])
    setHasSearched(false)
    try {
      let status: { isLoggedIn: boolean; username: string; userId: string }
      const cachedSearchResult = await tryCachedXiaohongshuSearch({
        cachedLogin,
        search: () => runSearch(trimmedKeywords),
        verifyLogin: () => {
          setIsPreparing(true)
          return integrationServices.getXiaohongshuLoginStatus({
            endpoint: endpoint.trim() || undefined,
          })
        },
      })

      if (cachedSearchResult.kind === "search-complete") {
        return
      }
      if (cachedSearchResult.kind === "login-required") {
        status = cachedSearchResult.status
        clearCachedXiaohongshuLogin({ endpoint })
        setLoginUsername("")
      } else {
        status = await integrationServices.getXiaohongshuLoginStatus({
          endpoint: endpoint.trim() || undefined,
        })
      }
      setIsPreparing(false)
      setLoginUsername(status.username)

      if (!status.isLoggedIn) {
        const qrCode = await integrationServices.getXiaohongshuLoginQRCode({
          endpoint: endpoint.trim() || undefined,
        })
        if (!qrCode.isLoggedIn && qrCode.image) {
          setLoginQRCode(qrCode.image)
          setPendingKeywords(trimmedKeywords)
          return
        }
      } else {
        setCachedXiaohongshuLogin({
          endpoint,
          username: status.username,
          userId: status.userId,
        })
      }

      setLoginQRCode("")
      setPendingKeywords(null)
      await runSearch(trimmedKeywords)
    } catch (error) {
      toast.error(t("discover.xiaohongshu.search_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setIsPreparing(false)
      setIsSearching(false)
    }
  }

  const handleSubscribe = async (account: XiaohongshuSearchAccount) => {
    if (!integrationServices) {
      toast.error(t("discover.xiaohongshu.desktop_only"))
      return
    }

    if (subscribingUserIds.has(account.userId) || subscribedUserIds.has(account.userId)) {
      return
    }

    setSubscribingUserIds((current) => addAccountTask(current, account.userId))
    try {
      const profile = await integrationServices.fetchXiaohongshuUserProfile({
        userId: account.userId,
        xsecToken: account.xsecToken,
        endpoint: endpoint.trim() || undefined,
      })
      const imported = await importXiaohongshuProfileToLocalFeed(profile)

      toast.success(
        t("discover.xiaohongshu.subscribe_success", {
          name: profile.nickname || account.nickname,
          count: imported.entryCount,
        }),
      )
      setSubscribedUserIds((current) => addAccountTask(current, account.userId))
    } catch (error) {
      toast.error(t("discover.xiaohongshu.subscribe_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setSubscribingUserIds((current) => removeAccountTask(current, account.userId))
    }
  }

  if (!canUseLocalMCP) {
    return (
      <div className="w-[640px] max-w-full space-y-3">
        <div className="rounded-lg border border-fill-secondary bg-fill-quaternary p-4 text-sm text-text-secondary">
          {t("discover.xiaohongshu.desktop_only")}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-[680px] max-w-full flex-col gap-5">
      <div className="grid gap-2">
        <Label className="text-xs text-text">{t("discover.xiaohongshu.keyword")}</Label>
        <div className="flex gap-2">
          <Input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return
              }
              if (event.key === "Enter") {
                event.preventDefault()
                void handleSearch()
              }
            }}
            placeholder={t("discover.xiaohongshu.keyword_placeholder")}
            className="h-10 min-w-0 flex-1"
          />
          <Button
            type="button"
            isLoading={isSearching}
            buttonClassName="shrink-0 whitespace-nowrap"
            onClick={() => void handleSearch()}
          >
            {t("words.search")}
          </Button>
        </div>
        <div className="text-xs leading-5 text-text-tertiary">
          {t("discover.xiaohongshu.account_search_hint")}
        </div>
        {isPreparing && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <i className="i-mgc-loading-3-cute-re size-3.5 animate-spin" />
            <span>{t("discover.xiaohongshu.preparing")}</span>
          </div>
        )}
      </div>

      {loginQRCode && (
        <div className="flex items-center gap-4 rounded-lg border border-fill-secondary bg-fill-quaternary p-4">
          <img
            src={loginQRCode}
            alt={t("discover.xiaohongshu.login_qrcode_alt")}
            className="size-36 shrink-0 rounded-md bg-white p-2"
          />
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium text-text">
              {t("discover.xiaohongshu.login_scan")}
            </div>
            <div className="text-xs leading-5 text-text-secondary">
              {t("discover.xiaohongshu.login_waiting")}
            </div>
          </div>
        </div>
      )}

      {!loginQRCode && loginUsername && (
        <div className="flex items-center gap-2 text-xs text-green">
          <i className="i-mgc-check-circle-cute-fi size-4" />
          <span>{t("discover.xiaohongshu.logged_in_as", { username: loginUsername })}</span>
        </div>
      )}

      <div className="min-h-[280px] overflow-hidden rounded-lg border border-fill-secondary bg-fill-quaternary">
        <div className="border-b border-fill-secondary px-4 py-3 text-sm font-medium text-text">
          {t("discover.xiaohongshu.results", { count: accounts.length })}
        </div>

        <div className="max-h-[460px] overflow-y-auto p-2">
          {accounts.length > 0 ? (
            <div className="space-y-2">
              {accounts.map((account) => {
                const avatarUrl = replaceImgUrlIfNeed(account.avatar) || account.avatar
                const subscriptionState = getAccountSubscriptionState({
                  userId: account.userId,
                  syncingUserIds: subscribingUserIds,
                  subscribedUserIds,
                })
                return (
                  <div
                    key={account.userId}
                    className="rounded-lg border border-fill-secondary bg-background p-3 transition-colors hover:border-accent/40"
                  >
                    <div className="flex items-start gap-3">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={account.nickname}
                          className="size-11 shrink-0 rounded-full bg-fill-tertiary object-cover"
                        />
                      ) : (
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-base font-medium text-text-secondary">
                          {(account.nickname || account.userId).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-text">
                          {account.nickname || account.userId}
                        </div>
                        <div className="mt-0.5 text-xs text-text-tertiary">
                          {t("discover.xiaohongshu.matched_notes", {
                            count: account.matchedNoteCount,
                          })}
                        </div>
                        {account.sampleTitles.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-text-secondary">
                            {account.sampleTitles.slice(0, 2).map((title) => (
                              <div key={title} className="flex min-w-0 items-start gap-1.5">
                                <i className="i-mgc-file-cute-re mt-0.5 shrink-0 text-text-tertiary" />
                                <span className="line-clamp-1">{title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <a
                        href={account.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-fill-secondary hover:text-text"
                      >
                        <i className="i-mgc-external-link-cute-re size-3.5" />
                        {t("discover.xiaohongshu.open_profile")}
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        disabled={subscriptionState.isDisabled}
                        isLoading={subscriptionState.isSyncing}
                        onClick={() => void handleSubscribe(account)}
                      >
                        <i
                          className={
                            subscriptionState.isSubscribed
                              ? "i-mgc-check-circle-cute-fi mr-1 size-3.5"
                              : "i-mgc-add-cute-re mr-1 size-3.5"
                          }
                        />
                        <span>
                          {subscriptionState.isSubscribed
                            ? t("feed.actions.followed")
                            : t("discover.xiaohongshu.subscribe")}
                        </span>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-tertiary">
              <i className="i-mgc-user-search-cute-re size-7" />
              <div>
                {hasSearched
                  ? t("discover.xiaohongshu.no_results")
                  : t("discover.xiaohongshu.empty")}
              </div>
            </div>
          )}
        </div>
      </div>

      <details className="group text-xs text-text-tertiary">
        <summary className="cursor-pointer select-none transition-colors hover:text-text-secondary">
          {t("discover.xiaohongshu.advanced_settings")}
        </summary>
        <div className="mt-3 grid gap-2 rounded-lg border border-fill-secondary bg-fill-quaternary p-3">
          <Label className="text-xs text-text">{t("discover.xiaohongshu.endpoint")}</Label>
          <Input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder={t("discover.xiaohongshu.endpoint_placeholder")}
            className="h-9 text-xs"
          />
          <div>{t("discover.xiaohongshu.endpoint_help")}</div>
        </div>
      </details>
    </div>
  )
}
