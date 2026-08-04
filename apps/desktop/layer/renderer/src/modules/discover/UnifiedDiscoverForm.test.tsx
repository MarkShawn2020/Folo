/* eslint-disable @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks, @eslint-react/hooks-extra/no-unnecessary-use-prefix */
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { UnifiedDiscoverForm } from "./UnifiedDiscoverForm"

const mocks = vi.hoisted(() => ({
  present: vi.fn(),
}))

vi.mock("@follow/components/hooks/useMobile.js", () => ({ useMobile: () => false }))
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    isPending: false,
    isSuccess: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "discover.channels.settings_summary" ? `Channel settings (${options?.count})` : key,
  }),
}))
vi.mock("react-router", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ present: mocks.present, dismissAll: vi.fn() }),
}))
vi.mock("~/hooks/common/useRequireLogin", () => ({
  useRequireLogin: () => ({ ensureLogin: () => true }),
}))
vi.mock("~/lib/api-client", () => ({ followClient: {} }))
vi.mock("~/lib/client", () => ({ ipcServices: null }))
vi.mock("~/lib/error-parser", () => ({ toastFetchError: vi.fn() }))
vi.mock("./atoms/discover", () => ({
  getDiscoverSearchData: () => ({}),
  setDiscoverSearchData: vi.fn(),
  setXiaohongshuDiscoverSearchData: vi.fn(),
  useDiscoverSearchData: () => ({}),
  useXiaohongshuDiscoverSearchData: () => ({}),
}))
vi.mock("./DiscoverChannelsPanel", () => ({ DiscoverChannelsPanel: () => null }))
vi.mock("./DiscoverFeedCard", () => ({ DiscoverFeedCard: () => null }))
vi.mock("./DiscoverImport", () => ({ DiscoverImport: () => null }))
vi.mock("./DiscoverInboxList", () => ({ DiscoverInboxList: () => null }))
vi.mock("./DiscoverTransform", () => ({ DiscoverTransform: () => null }))
vi.mock("./DiscoverUser", () => ({ DiscoverUser: () => null }))
vi.mock("./FeedForm", () => ({ FeedForm: () => null }))
vi.mock("./wxmp-local-import", () => ({
  createWxmpDiscoveryItem: vi.fn(),
  importWxmpChannelToLocalFeed: vi.fn(),
}))
vi.mock("./xiaohongshu/xiaohongshu-login-cache", () => ({
  getCachedXiaohongshuLogin: () => null,
}))
vi.mock("./xiaohongshu/XiaohongshuAccountCard", () => ({
  XiaohongshuAccountCard: () => null,
}))

describe("UnifiedDiscoverForm channel settings", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
      cancelAnimationFrame: globalThis.clearTimeout,
      requestAnimationFrame: (callback: FrameRequestCallback) => globalThis.setTimeout(callback, 0),
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount())
    }
    container?.remove()
    container = null
    root = null
    mocks.present.mockReset()
  })

  it("opens channel settings without validating an untouched empty search", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<UnifiedDiscoverForm />)
      await Promise.resolve()
    })

    const input = container.querySelector<HTMLInputElement>("[data-testid=discover-form-input]")
    const trigger = container.querySelector<HTMLButtonElement>(
      "[data-testid=discover-channels-trigger]",
    )
    expect(input).not.toBeNull()
    expect(trigger).not.toBeNull()
    expect(trigger?.type).toBe("button")
    expect(trigger?.textContent).toContain("(3)")

    await act(async () => {
      input?.focus()
      trigger?.focus()
      trigger?.click()
      await Promise.resolve()
    })

    expect(input?.getAttribute("aria-invalid")).toBe("false")
    expect(container.querySelector('[id$="-form-item-message"]')).toBeNull()
    expect(mocks.present).toHaveBeenCalledOnce()
  })
})
