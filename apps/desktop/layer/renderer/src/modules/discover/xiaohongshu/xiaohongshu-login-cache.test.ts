import { describe, expect, it, vi } from "vitest"

import {
  clearCachedXiaohongshuLogin,
  getCachedXiaohongshuLogin,
  setCachedXiaohongshuLogin,
  tryCachedXiaohongshuSearch,
} from "./xiaohongshu-login-cache"

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe("Xiaohongshu login cache", () => {
  it("reuses a verified managed-service login", () => {
    const storage = createStorage()
    setCachedXiaohongshuLogin({
      username: "手工川",
      userId: "user-a",
      storage,
      now: 1_000,
    })

    expect(getCachedXiaohongshuLogin({ storage, now: 2_000 })).toEqual({
      username: "手工川",
      userId: "user-a",
      verifiedAt: 1_000,
    })
  })

  it("keeps custom endpoints isolated", () => {
    const storage = createStorage()
    setCachedXiaohongshuLogin({
      endpoint: "http://one.test/mcp",
      username: "账号一",
      userId: "user-one",
      storage,
    })

    expect(getCachedXiaohongshuLogin({ endpoint: "http://two.test/mcp", storage })).toBeNull()
  })

  it("expires stale verification metadata and supports explicit invalidation", () => {
    const storage = createStorage()
    setCachedXiaohongshuLogin({
      username: "手工川",
      userId: "user-a",
      storage,
      now: 0,
    })
    expect(getCachedXiaohongshuLogin({ storage, now: 31 * 24 * 60 * 60 * 1000 })).toBeNull()

    setCachedXiaohongshuLogin({ username: "手工川", userId: "user-a", storage })
    clearCachedXiaohongshuLogin({ storage })
    expect(getCachedXiaohongshuLogin({ storage })).toBeNull()
  })

  it("searches immediately without another login probe when cached", async () => {
    const search = vi.fn().mockImplementation(async () => {})
    const verifyLogin = vi.fn()

    await expect(
      tryCachedXiaohongshuSearch({
        cachedLogin: { username: "手工川", userId: "user-a", verifiedAt: Date.now() },
        search,
        verifyLogin,
      }),
    ).resolves.toEqual({ kind: "search-complete" })
    expect(search).toHaveBeenCalledOnce()
    expect(verifyLogin).not.toHaveBeenCalled()
  })
})
