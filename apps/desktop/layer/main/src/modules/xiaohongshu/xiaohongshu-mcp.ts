const DEFAULT_MCP_URL = "http://localhost:18060/mcp"
const DEFAULT_TIMEOUT = 180_000
const MCP_PROTOCOL_VERSION = "2024-11-05"

export interface XiaohongshuMCPOptions {
  endpoint?: string
  timeout?: number
  signal?: AbortSignal
}

export interface XiaohongshuSearchNote {
  index: number
  title: string
  author: string
  authorId: string
  authorAvatar: string
  likedCount: string
  commentCount: string
  collectedCount: string
  cover: string
  url: string
  noteId: string | null
  xsecToken: string | null
  raw: string
}

export interface XiaohongshuSearchAccount {
  userId: string
  nickname: string
  avatar: string
  profileUrl: string
  xsecToken: string
  matchedNoteCount: number
  sampleTitles: string[]
}

export interface XiaohongshuUserProfile {
  userId: string
  redId: string
  nickname: string
  description: string
  avatar: string
  profileUrl: string
  notes: XiaohongshuSearchNote[]
}

export interface XiaohongshuNoteContent {
  title: string
  author: string
  publishedAt: string
  likedCount: string
  commentCount: string
  collectedCount: string
  url: string
  content: string
  cover: string
  raw: string
}

export interface XiaohongshuLoginStatus {
  isLoggedIn: boolean
  username: string
  userId: string
}

export interface XiaohongshuLoginQRCode {
  isLoggedIn: boolean
  image: string
  timeout: string
}

type JsonRpcResponse = {
  id?: unknown
  result?: unknown
  error?: {
    message?: string
    data?: unknown
  }
}

type XiaohongshuApiResponse = {
  success?: boolean
  data?: unknown
  error?: string
  message?: string
}

type XiaohongshuToolName = "search_feeds" | "get_feed_detail" | "user_profile"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const getRecord = (value: unknown, key: string) => {
  if (!isRecord(value)) {
    return null
  }

  const field = value[key]
  return isRecord(field) ? field : null
}

const getArray = (value: unknown, key: string) => {
  if (!isRecord(value)) {
    return []
  }

  const field = value[key]
  return Array.isArray(field) ? field : []
}

const getString = (value: unknown, key: string) => {
  if (!isRecord(value)) {
    return ""
  }

  const field = value[key]
  if (typeof field === "string") {
    return field
  }
  if (typeof field === "number") {
    return String(field)
  }
  return ""
}

const getNumber = (value: unknown, key: string) => {
  if (!isRecord(value)) {
    return null
  }

  const field = value[key]
  return typeof field === "number" && Number.isFinite(field) ? field : null
}

const stringifyUnknown = (value: unknown) => {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const getXiaohongshuMCPUrl = (endpoint?: string) => {
  const configured =
    endpoint?.trim() ||
    process.env.XIAOHONGSHU_MCP_URL ||
    process.env.XHS_MCP_URL ||
    DEFAULT_MCP_URL
  const normalized = /^https?:\/\//.test(configured) ? configured : `http://${configured}`

  try {
    const parsed = new URL(normalized)
    if (parsed.pathname === "" || parsed.pathname === "/") {
      parsed.pathname = "/mcp"
    }
    return parsed.toString()
  } catch {
    throw new Error(`Invalid Xiaohongshu MCP URL: ${configured}`)
  }
}

const isManagedLocalEndpoint = (endpoint: string) => {
  const parsed = new URL(endpoint)
  return (
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
    parsed.port === "18060" &&
    parsed.pathname === "/mcp"
  )
}

const withManagedLocalService = async <T>(endpoint: string, operation: () => Promise<T>) => {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof TypeError) || !isManagedLocalEndpoint(endpoint)) {
      throw error
    }

    const { ensureLocalXiaohongshuMCP } = await import("./xiaohongshu-service")
    await ensureLocalXiaohongshuMCP(endpoint)
    return operation()
  }
}

const getXiaohongshuApiUrl = (endpoint: string, pathname: string) => {
  const url = new URL(endpoint)
  url.pathname = pathname
  url.search = ""
  url.hash = ""
  return url.toString()
}

const getXiaohongshuApiData = async (pathname: string, options: XiaohongshuMCPOptions = {}) => {
  const endpoint = getXiaohongshuMCPUrl(options.endpoint)
  const apiUrl = getXiaohongshuApiUrl(endpoint, pathname)
  const timeout = options.timeout ?? DEFAULT_TIMEOUT

  return withManagedLocalService(endpoint, async () => {
    const controller = new AbortController()
    let didTimeOut = false
    const abortRequest = () => controller.abort()
    if (options.signal?.aborted) {
      controller.abort()
    } else {
      options.signal?.addEventListener("abort", abortRequest, { once: true })
    }
    const timeoutId = setTimeout(() => {
      didTimeOut = true
      controller.abort()
    }, timeout)
    try {
      const response = await fetch(apiUrl, { signal: controller.signal })
      const payload = (await response.json()) as XiaohongshuApiResponse
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`)
      }
      return payload.data
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (!didTimeOut && options.signal?.aborted) {
          throw new Error("Xiaohongshu MCP request was cancelled.")
        }
        throw new Error(`Xiaohongshu MCP timed out after ${timeout}ms: ${apiUrl}`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
      options.signal?.removeEventListener("abort", abortRequest)
    }
  })
}

const getNoteIdentity = (url: string) => {
  try {
    const parsed = new URL(url)
    return {
      noteId: parsed.pathname.split("/").findLast(Boolean) || null,
      xsecToken: parsed.searchParams.get("xsec_token"),
    }
  } catch {
    return {
      noteId: null,
      xsecToken: null,
    }
  }
}

const getFeedUrl = (noteId: string | null, xsecToken: string | null) => {
  if (!noteId) {
    return ""
  }

  const url = new URL(`https://www.xiaohongshu.com/explore/${noteId}`)
  if (xsecToken) {
    url.searchParams.set("xsec_token", xsecToken)
  }
  url.searchParams.set("xsec_source", "pc_feed")
  return url.toString()
}

const getImageInfoUrl = (value: unknown) =>
  getString(value, "urlDefault") ||
  getString(value, "urlPre") ||
  getString(value, "url") ||
  getString(value, "url_default") ||
  ""

const getCoverUrl = (cover: unknown) => {
  const directUrl = getImageInfoUrl(cover)
  if (directUrl) {
    return directUrl
  }

  const infoList = getArray(cover, "infoList")
  for (const image of infoList) {
    const imageUrl = getImageInfoUrl(image)
    if (imageUrl) {
      return imageUrl
    }
  }
  return ""
}

const formatXiaohongshuTimestamp = (timestamp: unknown) => {
  if (typeof timestamp === "string") {
    return timestamp
  }
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return ""
  }

  const milliseconds = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
  return new Date(milliseconds).toISOString()
}

const parseJsonPayload = (text: string): unknown | null => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const readField = (text: string, label: string, nextLabels: string[]) => {
  const start = text.indexOf(`${label}:`)
  if (start === -1) {
    return ""
  }

  const valueStart = start + label.length + 1
  const nextIndexes = nextLabels
    .map((nextLabel) => text.indexOf(`\n${nextLabel}:`, valueStart))
    .filter((index) => index !== -1)
  const valueEnd = nextIndexes.length > 0 ? Math.min(...nextIndexes) : text.length

  return text.slice(valueStart, valueEnd).trim()
}

const parseLegacySearchResults = (text: string): XiaohongshuSearchNote[] => {
  const chunks = text
    .split(/\n(?=\s*\d+\.\s*\n)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return chunks.flatMap((chunk) => {
    const indexMatch = chunk.match(/^(\d+)\.\s*\n/)
    const urlMatch = chunk.match(/链接:\s*(https?:\/\/\S+)/)
    if (!indexMatch?.[1] || !urlMatch?.[1]) {
      return []
    }

    const index = Number.parseInt(indexMatch[1], 10)
    const likedCount = chunk.match(/点赞数:\s*([^\n]+)/)?.[1]?.trim() || ""
    const title = chunk
      .replace(/^(\d+)\.\s*\n/, "")
      .split(/\n\s*点赞数:/)[0]
      ?.trim()

    if (!title) {
      return []
    }

    const url = urlMatch[1]
    const { noteId, xsecToken } = getNoteIdentity(url)

    return [
      {
        index,
        title,
        author: "",
        authorId: "",
        authorAvatar: "",
        likedCount,
        commentCount: "",
        collectedCount: "",
        cover: "",
        url,
        noteId,
        xsecToken,
        raw: chunk,
      },
    ]
  })
}

const parseLegacyNoteContent = (text: string): XiaohongshuNoteContent => ({
  title: readField(text, "标题", [
    "作者",
    "发布时间",
    "点赞数",
    "评论数",
    "收藏数",
    "链接",
    "内容",
    "封面",
  ]),
  author: readField(text, "作者", [
    "发布时间",
    "点赞数",
    "评论数",
    "收藏数",
    "链接",
    "内容",
    "封面",
  ]),
  publishedAt: readField(text, "发布时间", ["点赞数", "评论数", "收藏数", "链接", "内容", "封面"]),
  likedCount: readField(text, "点赞数", ["评论数", "收藏数", "链接", "内容", "封面"]),
  commentCount: readField(text, "评论数", ["收藏数", "链接", "内容", "封面"]),
  collectedCount: readField(text, "收藏数", ["链接", "内容", "封面"]),
  url: readField(text, "链接", ["内容", "封面"]),
  content: readField(text, "内容", ["封面"]),
  cover: readField(text, "封面", []),
  raw: text,
})

const toSearchNote = (feed: unknown, fallbackIndex: number): XiaohongshuSearchNote | null => {
  const noteCard = getRecord(feed, "noteCard")
  const noteId = getString(feed, "id")
  const xsecToken = getString(feed, "xsecToken")
  const title = getString(noteCard, "displayTitle") || getString(noteCard, "title")

  if (!noteId || !title) {
    return null
  }

  const user = getRecord(noteCard, "user")
  const interactInfo = getRecord(noteCard, "interactInfo")
  const cover = getRecord(noteCard, "cover")

  return {
    index: getNumber(feed, "index") ?? fallbackIndex,
    title,
    author: getString(user, "nickname") || getString(user, "nickName"),
    authorId: getString(user, "userId") || getString(user, "user_id"),
    authorAvatar: getString(user, "avatar"),
    likedCount: getString(interactInfo, "likedCount"),
    commentCount: getString(interactInfo, "commentCount"),
    collectedCount: getString(interactInfo, "collectedCount"),
    cover: getCoverUrl(cover),
    url: getFeedUrl(noteId, xsecToken || null),
    noteId,
    xsecToken: xsecToken || null,
    raw: stringifyUnknown(feed),
  }
}

const parseSearchPayload = (payload: unknown): XiaohongshuSearchNote[] => {
  const feeds = Array.isArray(payload)
    ? payload
    : getArray(payload, "feeds").length > 0
      ? getArray(payload, "feeds")
      : getArray(getRecord(payload, "data"), "feeds")

  return feeds.flatMap((feed, index) => {
    const note = toSearchNote(feed, index)
    return note ? [note] : []
  })
}

export const parseXiaohongshuSearchResults = (text: string): XiaohongshuSearchNote[] => {
  const payload = parseJsonPayload(text)
  if (payload) {
    return parseSearchPayload(payload)
  }

  return parseLegacySearchResults(text)
}

const normalizePlatformSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().replaceAll(/\s+/g, "")

const getAccountMatchRank = (account: XiaohongshuSearchAccount, keywords: string) => {
  const normalizedKeywords = normalizePlatformSearchText(keywords)
  if (!normalizedKeywords) {
    return 3
  }

  const normalizedNickname = normalizePlatformSearchText(account.nickname)
  if (normalizedNickname === normalizedKeywords) {
    return 0
  }
  if (normalizedNickname.includes(normalizedKeywords)) {
    return 1
  }
  if (
    account.sampleTitles.some((title) =>
      normalizePlatformSearchText(title).includes(normalizedKeywords),
    )
  ) {
    return 2
  }
  return 3
}

export const parseXiaohongshuSearchAccounts = (
  text: string,
  keywords = "",
): XiaohongshuSearchAccount[] => {
  const accounts = new Map<string, XiaohongshuSearchAccount>()

  for (const note of parseXiaohongshuSearchResults(text)) {
    if (!note.authorId || !note.xsecToken) {
      continue
    }

    const existingAccount = accounts.get(note.authorId)
    if (existingAccount) {
      existingAccount.matchedNoteCount += 1
      if (
        note.title &&
        existingAccount.sampleTitles.length < 3 &&
        !existingAccount.sampleTitles.includes(note.title)
      ) {
        existingAccount.sampleTitles.push(note.title)
      }
      if (!existingAccount.nickname && note.author) {
        existingAccount.nickname = note.author
      }
      if (!existingAccount.avatar && note.authorAvatar) {
        existingAccount.avatar = note.authorAvatar
      }
      if (!existingAccount.xsecToken && note.xsecToken) {
        existingAccount.xsecToken = note.xsecToken
      }
      continue
    }

    const encodedUserId = encodeURIComponent(note.authorId)
    accounts.set(note.authorId, {
      userId: note.authorId,
      nickname: note.author,
      avatar: note.authorAvatar,
      profileUrl: `https://www.xiaohongshu.com/user/profile/${encodedUserId}`,
      xsecToken: note.xsecToken,
      matchedNoteCount: 1,
      sampleTitles: note.title ? [note.title] : [],
    })
  }

  const results = [...accounts.values()]
  const strictResults = keywords.trim()
    ? results.filter((account) => getAccountMatchRank(account, keywords) < 3)
    : results

  return strictResults.sort((left, right) => {
    const rankDifference =
      getAccountMatchRank(left, keywords) - getAccountMatchRank(right, keywords)
    if (rankDifference !== 0) {
      return rankDifference
    }
    return right.matchedNoteCount - left.matchedNoteCount
  })
}

export const parseXiaohongshuUserProfile = (
  text: string,
  userId: string,
): XiaohongshuUserProfile => {
  const payload = parseJsonPayload(text)
  if (!payload) {
    throw new Error("Xiaohongshu MCP returned an invalid user profile.")
  }

  const basicInfo = getRecord(payload, "userBasicInfo")
  const encodedUserId = encodeURIComponent(userId)

  return {
    userId,
    redId: getString(basicInfo, "redId"),
    nickname: getString(basicInfo, "nickname"),
    description: getString(basicInfo, "desc"),
    avatar:
      getString(basicInfo, "imageb") ||
      getString(basicInfo, "images") ||
      getString(basicInfo, "avatar"),
    profileUrl: `https://www.xiaohongshu.com/user/profile/${encodedUserId}`,
    notes: parseSearchPayload(payload),
  }
}

export const parseXiaohongshuNoteContent = (text: string): XiaohongshuNoteContent => {
  const payload = parseJsonPayload(text)
  if (!payload) {
    return parseLegacyNoteContent(text)
  }

  const data = getRecord(payload, "data") || payload
  const note = getRecord(data, "note") || data
  const user = getRecord(note, "user")
  const interactInfo = getRecord(note, "interactInfo")
  const imageList = getArray(note, "imageList")
  const noteId = getString(note, "noteId") || getString(payload, "feed_id")
  const xsecToken = getString(note, "xsecToken")

  let cover = ""
  for (const image of imageList) {
    cover = getImageInfoUrl(image)
    if (cover) {
      break
    }
  }

  return {
    title: getString(note, "title"),
    author: getString(user, "nickname") || getString(user, "nickName"),
    publishedAt: formatXiaohongshuTimestamp(getNumber(note, "time") ?? getString(note, "time")),
    likedCount: getString(interactInfo, "likedCount"),
    commentCount: getString(interactInfo, "commentCount"),
    collectedCount: getString(interactInfo, "collectedCount"),
    url: getFeedUrl(noteId || null, xsecToken || null),
    content: getString(note, "desc"),
    cover,
    raw: text,
  }
}

const parseJsonRpcHttpResponse = (text: string): JsonRpcResponse | null => {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed) as JsonRpcResponse
  } catch {
    const dataLines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]")

    const lastDataLine = dataLines.at(-1)
    if (!lastDataLine) {
      throw new Error(`Invalid MCP response: ${trimmed.slice(0, 500)}`)
    }

    return JSON.parse(lastDataLine) as JsonRpcResponse
  }
}

const extractToolText = (result: unknown) => {
  if (!isRecord(result)) {
    return stringifyUnknown(result)
  }

  const { content } = result
  if (!Array.isArray(content)) {
    return stringifyUnknown(result)
  }

  return content
    .flatMap((item) => {
      if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") {
        return []
      }
      return [item.text]
    })
    .join("\n")
}

const getJsonRpcError = (message: JsonRpcResponse | null) => {
  if (!message?.error?.message) {
    return null
  }

  return message.error.data
    ? `${message.error.message}: ${stringifyUnknown(message.error.data)}`
    : message.error.message
}

async function performXiaohongshuToolCall(
  endpoint: string,
  toolName: XiaohongshuToolName,
  toolArguments: Record<string, unknown>,
  timeout: number,
  signal?: AbortSignal,
) {
  const controller = new AbortController()
  let didTimeOut = false
  const abortRequest = () => controller.abort()
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener("abort", abortRequest, { once: true })
  }
  const timeoutId = setTimeout(() => {
    didTimeOut = true
    controller.abort()
  }, timeout)
  let sessionId: string | null = null
  let nextId = 1

  const postJsonRpc = async (message: Record<string, unknown>) => {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    }
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: controller.signal,
    })

    const responseSessionId = response.headers.get("mcp-session-id")
    if (responseSessionId) {
      sessionId = responseSessionId
    }

    const responseText = await response.text()
    if (!response.ok) {
      throw new Error(
        responseText
          ? `Xiaohongshu MCP request failed (${response.status}): ${responseText.slice(0, 1000)}`
          : `Xiaohongshu MCP request failed (${response.status}).`,
      )
    }

    return parseJsonRpcHttpResponse(responseText)
  }

  try {
    const initializeResponse = await postJsonRpc({
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "Folo",
          version: "desktop",
        },
      },
    })
    const initializeError = getJsonRpcError(initializeResponse)
    if (initializeError) {
      throw new Error(initializeError)
    }

    await postJsonRpc({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    })

    const toolResponse = await postJsonRpc({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArguments,
      },
    })

    const error = getJsonRpcError(toolResponse)
    if (error) {
      throw new Error(error)
    }

    const toolResult = toolResponse?.result
    const text = extractToolText(toolResult)
    if (isRecord(toolResult) && toolResult.isError === true) {
      throw new Error(text || "Xiaohongshu MCP tool returned an error.")
    }
    if (!text.trim()) {
      throw new Error("Xiaohongshu MCP returned an empty response.")
    }

    return text
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (!didTimeOut && signal?.aborted) {
        throw new Error("Xiaohongshu MCP request was cancelled.")
      }
      throw new Error(`Xiaohongshu MCP timed out after ${timeout}ms: ${endpoint}`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abortRequest)
  }
}

async function callXiaohongshuTool(
  toolName: XiaohongshuToolName,
  toolArguments: Record<string, unknown>,
  options: XiaohongshuMCPOptions = {},
) {
  const endpoint = getXiaohongshuMCPUrl(options.endpoint)
  const timeout = options.timeout ?? DEFAULT_TIMEOUT

  return withManagedLocalService(endpoint, () =>
    performXiaohongshuToolCall(endpoint, toolName, toolArguments, timeout, options.signal),
  )
}

export async function getXiaohongshuLoginStatus(
  options?: XiaohongshuMCPOptions,
): Promise<XiaohongshuLoginStatus> {
  const data = await getXiaohongshuApiData("/api/v1/login/status", options)
  const status = isRecord(data) ? data : {}

  return {
    isLoggedIn: status.is_logged_in === true,
    username: getString(status, "username"),
    userId: getString(status, "user_id"),
  }
}

export async function getXiaohongshuLoginQRCode(
  options?: XiaohongshuMCPOptions,
): Promise<XiaohongshuLoginQRCode> {
  const data = await getXiaohongshuApiData("/api/v1/login/qrcode", options)
  const qrCode = isRecord(data) ? data : {}

  return {
    isLoggedIn: qrCode.is_logged_in === true,
    image: getString(qrCode, "img"),
    timeout: getString(qrCode, "timeout"),
  }
}

export async function searchXiaohongshuNotes(keywords: string, options?: XiaohongshuMCPOptions) {
  const raw = await callXiaohongshuTool("search_feeds", { keyword: keywords }, options)
  return {
    raw,
    notes: parseXiaohongshuSearchResults(raw),
  }
}

export async function searchXiaohongshuAccounts(keywords: string, options?: XiaohongshuMCPOptions) {
  const raw = await callXiaohongshuTool("search_feeds", { keyword: keywords }, options)
  return {
    accounts: parseXiaohongshuSearchAccounts(raw, keywords),
  }
}

export async function getXiaohongshuUserProfile(
  userId: string,
  xsecToken: string,
  options?: XiaohongshuMCPOptions,
) {
  const raw = await callXiaohongshuTool(
    "user_profile",
    {
      user_id: userId,
      xsec_token: xsecToken,
    },
    options,
  )

  return parseXiaohongshuUserProfile(raw, userId)
}

export async function getXiaohongshuNoteContent(url: string, options?: XiaohongshuMCPOptions) {
  const { noteId, xsecToken } = getNoteIdentity(url)
  if (!noteId || !xsecToken) {
    throw new Error("Xiaohongshu note URL must include both note id and xsec_token.")
  }

  const raw = await callXiaohongshuTool(
    "get_feed_detail",
    {
      feed_id: noteId,
      xsec_token: xsecToken,
      load_all_comments: false,
    },
    options,
  )

  return parseXiaohongshuNoteContent(raw)
}
