/* eslint-disable @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks, @eslint-react/hooks-extra/no-unnecessary-use-prefix */
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { DiscoverChannelsPanel } from "./DiscoverChannelsPanel"

const mocks = vi.hoisted(() => ({
  clearCachedXiaohongshuLogin: vi.fn(),
  logoutWechat: vi.fn(),
  logoutXiaohongshu: vi.fn(),
  present: vi.fn(),
  setCachedXiaohongshuLogin: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  translate: vi.fn((key: string, options?: { name?: string; username?: string }) =>
    String(options?.name || options?.username || key),
  ),
  wechatStatus: vi.fn(),
}))

vi.mock("@follow/components/ui/button/index.js", () => ({
  Button: ({
    buttonClassName,
    isLoading,
    size,
    status,
    textClassName,
    variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    buttonClassName?: string
    isLoading?: boolean
    size?: string
    status?: string
    textClassName?: string
    variant?: string
  }) => (
    <button
      {...props}
      type={props.type || "button"}
      className={buttonClassName}
      disabled={props.disabled || isLoading}
      data-size={size}
      data-status={status}
      data-text-class={textClassName}
      data-variant={variant}
    />
  ),
}))
vi.mock("@follow/components/ui/loading/index.jsx", () => ({
  LoadingCircle: () => <span>loading</span>,
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mocks.translate,
  }),
}))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ present: mocks.present }),
}))
vi.mock("~/lib/client", () => ({
  ipcServices: {
    integration: {
      getXiaohongshuLoginQRCode: vi.fn(),
      getXiaohongshuLoginStatus: vi.fn(),
      logoutXiaohongshu: mocks.logoutXiaohongshu,
    },
    wxmp: {
      logout: mocks.logoutWechat,
      openLogin: vi.fn(),
      status: mocks.wechatStatus,
    },
  },
}))
vi.mock("~/lib/error-parser", () => ({
  getFetchErrorMessage: (error: Error) => error.message,
}))
vi.mock("./WechatChannelForm", () => ({ WechatChannelForm: () => null }))
vi.mock("./xiaohongshu/xiaohongshu-login-cache", () => ({
  clearCachedXiaohongshuLogin: mocks.clearCachedXiaohongshuLogin,
  getCachedXiaohongshuLogin: () => ({
    username: "手工川",
    userId: "xhs-user",
    verifiedAt: Date.now(),
  }),
  setCachedXiaohongshuLogin: mocks.setCachedXiaohongshuLogin,
}))

describe("DiscoverChannelsPanel logout actions", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    Object.assign(window, {
      electron: { ipcRenderer: {} },
      clearInterval: globalThis.clearInterval,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      setTimeout: globalThis.setTimeout,
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount())
    }
    container?.remove()
    container = null
    root = null
    vi.clearAllMocks()
  })

  it("shows logout only for authenticated channels and revokes both sessions", async () => {
    mocks.wechatStatus.mockResolvedValue({
      loggedIn: true,
      wcxPath: "/usr/local/bin/wcx",
      account: { nickname: "微信公众号", alias: null, username: null },
    })
    mocks.logoutWechat.mockResolvedValue({
      loggedIn: false,
      wcxPath: "/usr/local/bin/wcx",
      account: null,
    })
    mocks.logoutXiaohongshu.mockImplementation(() => Promise.resolve())

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<DiscoverChannelsPanel />)
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(container?.querySelector("[data-testid=discover-wechat-logout]")).not.toBeNull()
    })
    expect(container.querySelector("[data-testid=discover-xiaohongshu-logout]")).not.toBeNull()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-testid=discover-wechat-logout]")?.click()
      await Promise.resolve()
    })
    expect(mocks.logoutWechat).toHaveBeenCalledOnce()
    expect(container.querySelector("[data-testid=discover-wechat-logout]")).toBeNull()

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>("[data-testid=discover-xiaohongshu-logout]")
        ?.click()
      await Promise.resolve()
    })
    expect(mocks.logoutXiaohongshu).toHaveBeenCalledWith({})
    expect(mocks.clearCachedXiaohongshuLogin).toHaveBeenCalledWith({})
    expect(container.querySelector("[data-testid=discover-xiaohongshu-logout]")).toBeNull()
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2)
  })
})
