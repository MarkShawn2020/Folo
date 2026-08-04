import { getStorageNS } from "@follow/utils/ns"

const LOGIN_CACHE_KEY = getStorageNS("xiaohongshu-login")
const LOGIN_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const MANAGED_ENDPOINT_KEY = "managed"

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface XiaohongshuCachedLogin {
  username: string
  userId: string
  verifiedAt: number
}

interface XiaohongshuLoginStatus {
  isLoggedIn: boolean
  username: string
  userId: string
}

interface XiaohongshuLoginCache {
  version: 1
  sessions: Record<string, XiaohongshuCachedLogin>
}

const getEndpointKey = (endpoint?: string) => endpoint?.trim() || MANAGED_ENDPOINT_KEY

const readCache = (storage: StorageLike): XiaohongshuLoginCache => {
  try {
    const raw = storage.getItem(LOGIN_CACHE_KEY)
    if (!raw) {
      return { version: 1, sessions: {} }
    }
    const parsed = JSON.parse(raw) as Partial<XiaohongshuLoginCache>
    if (parsed.version !== 1 || !parsed.sessions || typeof parsed.sessions !== "object") {
      return { version: 1, sessions: {} }
    }
    return { version: 1, sessions: parsed.sessions }
  } catch {
    return { version: 1, sessions: {} }
  }
}

export const getCachedXiaohongshuLogin = ({
  endpoint,
  storage = window.localStorage,
  now = Date.now(),
}: {
  endpoint?: string
  storage?: StorageLike
  now?: number
}): XiaohongshuCachedLogin | null => {
  const cache = readCache(storage)
  const endpointKey = getEndpointKey(endpoint)
  const session = cache.sessions[endpointKey]
  if (
    !session ||
    typeof session.username !== "string" ||
    typeof session.userId !== "string" ||
    typeof session.verifiedAt !== "number" ||
    now - session.verifiedAt > LOGIN_CACHE_MAX_AGE
  ) {
    if (session) {
      delete cache.sessions[endpointKey]
      storage.setItem(LOGIN_CACHE_KEY, JSON.stringify(cache))
    }
    return null
  }
  return session
}

export const setCachedXiaohongshuLogin = ({
  endpoint,
  username,
  userId,
  storage = window.localStorage,
  now = Date.now(),
}: {
  endpoint?: string
  username: string
  userId: string
  storage?: StorageLike
  now?: number
}) => {
  const cache = readCache(storage)
  cache.sessions[getEndpointKey(endpoint)] = {
    username,
    userId,
    verifiedAt: now,
  }
  storage.setItem(LOGIN_CACHE_KEY, JSON.stringify(cache))
}

export const clearCachedXiaohongshuLogin = ({
  endpoint,
  storage = window.localStorage,
}: {
  endpoint?: string
  storage?: StorageLike
}) => {
  const cache = readCache(storage)
  delete cache.sessions[getEndpointKey(endpoint)]
  if (Object.keys(cache.sessions).length === 0) {
    storage.removeItem(LOGIN_CACHE_KEY)
    return
  }
  storage.setItem(LOGIN_CACHE_KEY, JSON.stringify(cache))
}

export const tryCachedXiaohongshuSearch = async ({
  cachedLogin,
  search,
  verifyLogin,
}: {
  cachedLogin: XiaohongshuCachedLogin | null
  search: () => Promise<void>
  verifyLogin: () => Promise<XiaohongshuLoginStatus>
}): Promise<
  | { kind: "cache-miss" }
  | { kind: "search-complete" }
  | { kind: "login-required"; status: XiaohongshuLoginStatus }
> => {
  if (!cachedLogin) return { kind: "cache-miss" }

  try {
    await search()
    return { kind: "search-complete" }
  } catch (searchError) {
    const status = await verifyLogin()
    if (status.isLoggedIn) {
      throw searchError
    }
    return { kind: "login-required", status }
  }
}
