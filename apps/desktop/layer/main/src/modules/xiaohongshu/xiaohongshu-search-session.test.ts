import { describe, expect, it, vi } from "vitest"

import {
  cancelXiaohongshuSearch,
  runCancellableXiaohongshuSearch,
} from "./xiaohongshu-search-session"

describe("Xiaohongshu cancellable search session", () => {
  it("aborts the active request and removes it from the registry", async () => {
    const onAbort = vi.fn()
    const searchPromise = runCancellableXiaohongshuSearch(
      "search-a",
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              onAbort()
              reject(new Error("cancelled"))
            },
            { once: true },
          )
        }),
    )

    expect(cancelXiaohongshuSearch("search-a")).toBe(true)
    await expect(searchPromise).rejects.toThrow("cancelled")
    expect(onAbort).toHaveBeenCalledOnce()
    expect(cancelXiaohongshuSearch("search-a")).toBe(false)
  })

  it("keeps searches with different request ids independent", async () => {
    let finishSecondSearch: (() => void) | undefined
    const firstSearch = runCancellableXiaohongshuSearch(
      "search-first",
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })
        }),
    )
    const secondSearch = runCancellableXiaohongshuSearch(
      "search-second",
      () =>
        new Promise<void>((resolve) => {
          finishSecondSearch = resolve
        }),
    )

    expect(cancelXiaohongshuSearch("search-first")).toBe(true)
    await expect(firstSearch).rejects.toThrow("cancelled")
    finishSecondSearch?.()
    await expect(secondSearch).resolves.toBeUndefined()
    expect(cancelXiaohongshuSearch("search-second")).toBe(false)
  })
})
