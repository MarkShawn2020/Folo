import { Button } from "@follow/components/ui/button/index.js"
import { LoadingCircle } from "@follow/components/ui/loading/index.jsx"
import { cn } from "@follow/utils/utils"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { ipcServices } from "~/lib/client"
import { getFetchErrorMessage } from "~/lib/error-parser"

import { WechatChannelForm } from "./WechatChannelForm"
import {
  clearCachedXiaohongshuLogin,
  getCachedXiaohongshuLogin,
  setCachedXiaohongshuLogin,
} from "./xiaohongshu/xiaohongshu-login-cache"

type ChannelState = "ready" | "cached" | "actionRequired" | "checking" | "unavailable"

interface ChannelStatus {
  state: ChannelState
  detail?: string
}

interface WechatStatusResponse {
  loggedIn: boolean
  wcxPath: string | null
  account: {
    nickname: string | null
    alias: string | null
    username: string | null
  } | null
}

interface ChannelRowProps {
  icon: React.ReactNode
  name: string
  description: string
  status: ChannelStatus
  children?: React.ReactNode
}

const statusStyles: Record<ChannelState, string> = {
  ready: "bg-green/10 text-green",
  cached: "bg-blue/10 text-blue",
  actionRequired: "bg-orange/10 text-orange",
  checking: "bg-fill-secondary text-text-secondary",
  unavailable: "bg-fill-secondary text-text-tertiary",
}

const getErrorMessage = (error: unknown) =>
  getFetchErrorMessage(error instanceof Error ? error : new Error(String(error)))

function ChannelRow({ icon, name, description, status, children }: ChannelRowProps) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-fill-secondary bg-material-ultra-thin p-4">
      <div className="flex items-start gap-3">
        <div className="center size-10 shrink-0 rounded-xl bg-fill-quaternary text-text-secondary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text">{name}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                statusStyles[status.state],
              )}
              role="status"
            >
              {status.state === "checking" && <LoadingCircle size="small" />}
              <span>{t(`discover.channels.status.${status.state}`)}</span>
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
          {status.detail && (
            <p className="mt-1 break-words text-xs leading-5 text-text-tertiary">{status.detail}</p>
          )}
        </div>
      </div>
      {children && <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>}
    </div>
  )
}

export function DiscoverChannelsPanel() {
  const { t } = useTranslation()
  const { present } = useModalStack()
  const canUseDesktopChannels = Boolean(window.electron?.ipcRenderer)
  const [wechatStatus, setWechatStatus] = useState<ChannelStatus>(() =>
    canUseDesktopChannels ? { state: "checking" } : { state: "unavailable" },
  )
  const [wechatNeedsSetup, setWechatNeedsSetup] = useState(false)
  const [wechatIsLoggedIn, setWechatIsLoggedIn] = useState(false)
  const [isWechatLoggingIn, setIsWechatLoggingIn] = useState(false)
  const [isWechatLoggingOut, setIsWechatLoggingOut] = useState(false)
  const cachedXiaohongshuLogin = useMemo(() => getCachedXiaohongshuLogin({}), [])
  const [xiaohongshuStatus, setXiaohongshuStatus] = useState<ChannelStatus>(() => {
    if (!canUseDesktopChannels) return { state: "unavailable" }
    if (cachedXiaohongshuLogin) {
      return {
        state: "cached",
        detail: cachedXiaohongshuLogin.username
          ? t("discover.xiaohongshu.logged_in_as", {
              username: cachedXiaohongshuLogin.username,
            })
          : undefined,
      }
    }
    return { state: "actionRequired" }
  })
  const [xiaohongshuIsLoggedIn, setXiaohongshuIsLoggedIn] = useState(
    Boolean(cachedXiaohongshuLogin),
  )
  const [isXiaohongshuInitializing, setIsXiaohongshuInitializing] = useState(false)
  const [isXiaohongshuLoggingOut, setIsXiaohongshuLoggingOut] = useState(false)
  const [xiaohongshuQRCode, setXiaohongshuQRCode] = useState("")

  const applyWechatStatus = useCallback(
    (status: WechatStatusResponse) => {
      const isReady = status.loggedIn && Boolean(status.wcxPath)
      setWechatIsLoggedIn(status.loggedIn)
      setWechatNeedsSetup(!status.wcxPath)
      setWechatStatus({
        state: isReady ? "ready" : "actionRequired",
        detail: !status.wcxPath
          ? t("discover.channels.wechat.runtime_required")
          : status.loggedIn
            ? status.account?.nickname || status.account?.alias || status.account?.username
              ? t("discover.wxmp.logged_in_as", {
                  name: status.account.nickname || status.account.alias || status.account.username,
                })
              : t("discover.wxmp.logged_in")
            : t("discover.wxmp.logged_out"),
      })
    },
    [t],
  )

  const refreshWechatStatus = useCallback(async () => {
    if (!canUseDesktopChannels || !ipcServices?.wxmp) {
      setWechatStatus({ state: "unavailable" })
      return
    }

    setWechatStatus({ state: "checking" })
    try {
      const status = await ipcServices.wxmp.status()
      applyWechatStatus(status)
    } catch (error) {
      setWechatIsLoggedIn(false)
      setWechatStatus({ state: "actionRequired", detail: getErrorMessage(error) })
    }
  }, [applyWechatStatus, canUseDesktopChannels])

  useEffect(() => {
    void refreshWechatStatus()
  }, [refreshWechatStatus])

  const initializeWechatCredentials = async () => {
    if (!ipcServices?.wxmp) return

    setIsWechatLoggingIn(true)
    try {
      await ipcServices.wxmp.openLogin()
      await refreshWechatStatus()
    } catch (error) {
      toast.error(t("discover.channels.initialize_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setIsWechatLoggingIn(false)
    }
  }

  const logoutWechatCredentials = async () => {
    if (!ipcServices?.wxmp) return

    setIsWechatLoggingOut(true)
    try {
      const status = await ipcServices.wxmp.logout()
      applyWechatStatus(status)
      toast.success(t("discover.channels.logged_out"))
    } catch (error) {
      toast.error(t("discover.channels.logout_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setIsWechatLoggingOut(false)
    }
  }

  const applyXiaohongshuLoginStatus = useCallback(
    (status: { isLoggedIn: boolean; username: string; userId: string }) => {
      if (status.isLoggedIn) {
        setXiaohongshuIsLoggedIn(true)
        setCachedXiaohongshuLogin({
          username: status.username,
          userId: status.userId,
        })
        setXiaohongshuStatus({
          state: "ready",
          detail: status.username
            ? t("discover.xiaohongshu.logged_in_as", { username: status.username })
            : undefined,
        })
        setXiaohongshuQRCode("")
        return true
      }

      clearCachedXiaohongshuLogin({})
      setXiaohongshuIsLoggedIn(false)
      setXiaohongshuStatus({ state: "actionRequired" })
      return false
    },
    [t],
  )

  const checkXiaohongshuCredentials = useCallback(async () => {
    if (!ipcServices?.integration) return false

    setXiaohongshuStatus({ state: "checking" })
    try {
      const status = await ipcServices.integration.getXiaohongshuLoginStatus({})
      return applyXiaohongshuLoginStatus(status)
    } catch (error) {
      setXiaohongshuStatus({
        state: "actionRequired",
        detail: getErrorMessage(error),
      })
      return false
    }
  }, [applyXiaohongshuLoginStatus])

  const initializeXiaohongshuCredentials = async () => {
    if (!ipcServices?.integration) return

    setIsXiaohongshuInitializing(true)
    setXiaohongshuStatus({ state: "checking" })
    try {
      const qrCode = await ipcServices.integration.getXiaohongshuLoginQRCode({})
      if (qrCode.isLoggedIn) {
        await checkXiaohongshuCredentials()
        return
      }
      if (!qrCode.image) {
        throw new Error(t("discover.channels.xiaohongshu.qr_missing"))
      }
      setXiaohongshuQRCode(qrCode.image)
      setXiaohongshuStatus({ state: "actionRequired" })
    } catch (error) {
      setXiaohongshuStatus({
        state: "actionRequired",
        detail: getErrorMessage(error),
      })
    } finally {
      setIsXiaohongshuInitializing(false)
    }
  }

  const logoutXiaohongshuCredentials = async () => {
    if (!ipcServices?.integration) return

    setIsXiaohongshuLoggingOut(true)
    try {
      await ipcServices.integration.logoutXiaohongshu({})
      clearCachedXiaohongshuLogin({})
      setXiaohongshuIsLoggedIn(false)
      setXiaohongshuQRCode("")
      setXiaohongshuStatus({ state: "actionRequired" })
      toast.success(t("discover.channels.logged_out"))
    } catch (error) {
      toast.error(t("discover.channels.logout_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setIsXiaohongshuLoggingOut(false)
    }
  }

  useEffect(() => {
    const integrationServices = ipcServices?.integration
    if (!xiaohongshuQRCode || !integrationServices) return

    let disposed = false
    let isPolling = false
    const pollLoginStatus = async () => {
      if (disposed || isPolling) return
      isPolling = true
      try {
        const status = await integrationServices.getXiaohongshuLoginStatus({})
        if (disposed || !status.isLoggedIn) return
        applyXiaohongshuLoginStatus(status)
        toast.success(t("discover.channels.credentials_ready"))
      } catch {
        // Keep polling while the QR code is visible.
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
  }, [applyXiaohongshuLoginStatus, t, xiaohongshuQRCode])

  const openWechatSettings = () => {
    present({
      title: t("discover.wxmp.title"),
      content: () => <WechatChannelForm />,
      modalClassName: "max-w-2xl w-full",
    })
  }

  return (
    <div className="w-[680px] max-w-full space-y-4">
      <p className="text-sm leading-6 text-text-secondary">{t("discover.channels.description")}</p>

      <div className="space-y-3">
        <ChannelRow
          icon={<i className="i-mgc-rss-2-cute-fi size-5 text-accent" aria-hidden />}
          name={t("discover.channels.folo.name")}
          description={t("discover.channels.folo.description")}
          status={{ state: "ready" }}
        />

        <ChannelRow
          icon={<i className="i-simple-icons-wechat size-5 text-green" aria-hidden />}
          name={t("discover.channels.wechat.name")}
          description={t("discover.channels.wechat.description")}
          status={wechatStatus}
        >
          {wechatIsLoggedIn && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              buttonClassName="text-red hover:bg-red/10"
              data-testid="discover-wechat-logout"
              isLoading={isWechatLoggingOut}
              disabled={isWechatLoggingIn}
              onClick={() => void logoutWechatCredentials()}
            >
              <i className="i-mgc-exit-cute-re mr-1 size-3.5" />
              {t("discover.channels.logout")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canUseDesktopChannels || isWechatLoggingOut}
            onClick={() => void refreshWechatStatus()}
          >
            <i className="i-mgc-refresh-2-cute-re mr-1 size-3.5" />
            {t("discover.channels.check")}
          </Button>
          {wechatNeedsSetup && (
            <Button type="button" size="sm" variant="outline" onClick={openWechatSettings}>
              <i className="i-mgc-settings-3-cute-re mr-1 size-3.5" />
              {t("discover.channels.configure")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!canUseDesktopChannels || isWechatLoggingOut}
            isLoading={isWechatLoggingIn}
            onClick={() => void initializeWechatCredentials()}
          >
            <i className="i-mgc-qr-code-cute-re mr-1 size-3.5" />
            <span>
              {wechatStatus.state === "ready"
                ? t("discover.channels.refresh_credentials")
                : t("discover.channels.initialize_credentials")}
            </span>
          </Button>
        </ChannelRow>

        <ChannelRow
          icon={<i className="i-simple-icons-xiaohongshu size-5 text-red" aria-hidden />}
          name={t("discover.channels.xiaohongshu.name")}
          description={t("discover.channels.xiaohongshu.description")}
          status={xiaohongshuStatus}
        >
          {xiaohongshuIsLoggedIn && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              buttonClassName="text-red hover:bg-red/10"
              data-testid="discover-xiaohongshu-logout"
              isLoading={isXiaohongshuLoggingOut}
              disabled={isXiaohongshuInitializing}
              onClick={() => void logoutXiaohongshuCredentials()}
            >
              <i className="i-mgc-exit-cute-re mr-1 size-3.5" />
              {t("discover.channels.logout")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canUseDesktopChannels || isXiaohongshuLoggingOut}
            onClick={() => void checkXiaohongshuCredentials()}
          >
            <i className="i-mgc-refresh-2-cute-re mr-1 size-3.5" />
            {t("discover.channels.check")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canUseDesktopChannels || isXiaohongshuLoggingOut}
            isLoading={isXiaohongshuInitializing}
            onClick={() => void initializeXiaohongshuCredentials()}
          >
            <i className="i-mgc-qr-code-cute-re mr-1 size-3.5" />
            <span>
              {xiaohongshuStatus.state === "ready" || xiaohongshuStatus.state === "cached"
                ? t("discover.channels.refresh_credentials")
                : t("discover.channels.initialize_credentials")}
            </span>
          </Button>
        </ChannelRow>
      </div>

      {xiaohongshuQRCode && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-fill-secondary bg-fill-quaternary p-4 text-center sm:flex-row sm:text-left">
          <img
            src={xiaohongshuQRCode}
            alt={t("discover.xiaohongshu.login_qrcode_alt")}
            className="size-32 shrink-0 rounded-lg bg-white p-2"
          />
          <div className="space-y-1">
            <div className="text-sm font-semibold text-text">
              {t("discover.xiaohongshu.login_scan")}
            </div>
            <p className="text-xs leading-5 text-text-secondary">
              {t("discover.channels.xiaohongshu.login_waiting")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
