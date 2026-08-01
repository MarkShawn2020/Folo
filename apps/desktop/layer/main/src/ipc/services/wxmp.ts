import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import { promisify } from "node:util"

import { app, BrowserWindow, dialog, session } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"
import path from "pathe"

import { store, StoreKey } from "~/lib/store"
import type { WxmpLoginAccount } from "~/modules/wxmp/wxmp-account"
import { isWxmpAccountSearchMatch, parseWxmpLoginAccount } from "~/modules/wxmp/wxmp-account"

const execFileAsync = promisify(execFile)

const LOGIN_URL = "https://mp.weixin.qq.com/"
const LOGIN_WINDOW_TITLE = "WeChat Official Account Login"
const WCX_MAX_BUFFER = 16 * 1024 * 1024
const WCX_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

interface WxmpStatus {
  wcxPath: string | null
  configPath: string
  cacheDbPath: string
  loggedIn: boolean
  token: string | null
  account: WxmpLoginAccount | null
  accountCount: number
  articleCount: number
  contentCount: number
}

interface WxmpFetchInput {
  query: string
  limit?: number
  withContent?: boolean
}

interface WxmpAccount {
  fakeid: string
  nickname: string
  alias: string | null
  signature: string | null
  avatar: string | null
  articleCount: number
}

interface WxmpArticle {
  aid: string
  fakeid: string
  title: string
  link: string
  digest: string | null
  cover: string | null
  author: string | null
  createTime: number
  contentHtml: string | null
  contentMd: string | null
}

interface WxmpFetchResult {
  account: WxmpAccount
  articles: WxmpArticle[]
  stdout: string
  stderr: string
}

interface WcxConfig {
  token?: string
  cookie?: string
  account?: WxmpLoginAccount | null
}

interface WcxCachePayload {
  account: WxmpAccount | null
  articles: WxmpArticle[]
}

const firstNonemptyLine = (...inputs: Array<string | undefined>) => {
  for (const input of inputs) {
    const line = input
      ?.split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean)
    if (line) return line
  }
  return null
}

const stripAnsi = (value: string) =>
  value.replaceAll(
    // eslint-disable-next-line no-control-regex
    /\u001B\[[\d;]*[A-Z]/gi,
    "",
  )

const getUsefulErrorMessage = (...inputs: Array<string | undefined>) => {
  for (const input of inputs) {
    const lines = stripAnsi(input || "")
      .split(/\r?\n/)
      .map((line) => line.replaceAll(/[╭╮╰╯│─]/g, " ").trim())
      .filter(Boolean)

    const errorLine = lines.findLast(
      (line) => !line.startsWith("Traceback ") && /error|exception|failed|invalid/i.test(line),
    )
    if (errorLine) return errorLine

    const lastLine = lines.findLast((line) => !line.startsWith("Traceback "))
    if (lastLine) return lastLine
  }

  return null
}

const getWcxDataDir = () => {
  if (process.platform === "linux") {
    return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "wcx")
  }

  return path.join(app.getPath("appData"), "wcx")
}

const getWcxConfigPath = () => path.join(getWcxDataDir(), "config.json")
const getWcxCacheDbPath = () => path.join(getWcxDataDir(), "cache.db")

const readWcxConfig = async (): Promise<WcxConfig | null> => {
  try {
    const raw = await fsp.readFile(getWcxConfigPath(), "utf-8")
    return JSON.parse(raw) as WcxConfig
  } catch {
    return null
  }
}

const writeWcxConfig = async (
  config: WcxConfig & Required<Pick<WcxConfig, "token" | "cookie">>,
) => {
  const configPath = getWcxConfigPath()
  await fsp.mkdir(path.dirname(configPath), { recursive: true })
  await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

const fetchWxmpLoginAccount = async (token: string, cookie: string) => {
  const url = new URL("cgi-bin/home", LOGIN_URL)
  url.searchParams.set("t", "home/index")
  url.searchParams.set("lang", "zh_CN")
  url.searchParams.set("token", token)

  const response = await fetch(url, {
    headers: {
      Cookie: cookie,
      Referer: LOGIN_URL,
      "User-Agent": WCX_BROWSER_USER_AGENT,
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return null

  return parseWxmpLoginAccount(await response.text())
}

const getHomeDir = () => {
  try {
    return app.getPath("home") || os.homedir()
  } catch {
    return os.homedir()
  }
}

const expandHome = (candidate: string) => {
  if (candidate === "~") return getHomeDir()
  if (candidate.startsWith("~/")) {
    return path.join(getHomeDir(), candidate.slice(2))
  }
  return candidate
}

const resolveExecutable = (candidate: string) => {
  const expanded = expandHome(candidate)

  if (path.isAbsolute(expanded) || expanded.includes(path.sep)) {
    return existsSync(expanded) ? expanded : null
  }

  const pathValue = process.env.PATH
  if (!pathValue) return null

  for (const dir of pathValue.split(path.delimiter)) {
    const resolved = path.join(dir, candidate)
    if (existsSync(resolved)) return resolved
  }

  return null
}

const probeWcx = async (candidate: string) => {
  const expanded = expandHome(candidate)
  try {
    await execFileAsync(expanded, ["--version"], {
      timeout: 10_000,
      maxBuffer: WCX_MAX_BUFFER,
    })
    return resolveExecutable(expanded) || expanded
  } catch {
    return null
  }
}

const locateWcxFromShell = async () => {
  const shells = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(
    (item): item is string => !!item && existsSync(item),
  )

  for (const shell of shells) {
    try {
      const { stdout } = await execFileAsync(shell, ["-lc", "command -v wcx"], {
        timeout: 10_000,
        maxBuffer: WCX_MAX_BUFFER,
      })
      const candidate = firstNonemptyLine(stdout)
      if (!candidate) continue

      const resolved = await probeWcx(candidate)
      if (resolved) return resolved
    } catch {
      continue
    }
  }

  return null
}

const locateWcx = async () => {
  const candidates = [
    process.env.WCX_BIN,
    store.get(StoreKey.WxmpWcxPath),
    path.join(getHomeDir(), ".local", "bin", "wcx"),
    path.join(os.homedir(), ".local", "bin", "wcx"),
    "/opt/homebrew/bin/wcx",
    "/usr/local/bin/wcx",
    "wcx",
  ].filter((item): item is string => !!item)

  for (const candidate of candidates) {
    const resolved = await probeWcx(candidate)
    if (resolved) return resolved
  }

  return locateWcxFromShell()
}

const splitShebang = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed.startsWith("#!")) return null
  const parts = trimmed.slice(2).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts
}

const getPythonCommand = async (wcxPath: string | null) => {
  if (wcxPath) {
    try {
      const script = await fsp.readFile(wcxPath, "utf-8")
      const shebang = splitShebang(script.split(/\r?\n/, 1)[0] || "")
      if (shebang) {
        if (path.basename(shebang[0]!) === "env" && shebang[1]) {
          return { command: shebang[1], args: shebang.slice(2) }
        }
        return { command: shebang[0]!, args: shebang.slice(1) }
      }
    } catch {
      // Fall back to common Python executables below.
    }
  }

  for (const command of process.platform === "win32" ? ["python", "py"] : ["python3", "python"]) {
    try {
      await execFileAsync(command, ["--version"], {
        timeout: 10_000,
        maxBuffer: WCX_MAX_BUFFER,
      })
      return { command, args: [] as string[] }
    } catch {
      continue
    }
  }

  throw new Error("Python is required to read the wcx cache database.")
}

const runPythonJson = async <T>(wcxPath: string | null, script: string, args: string[]) => {
  const python = await getPythonCommand(wcxPath)
  const { stdout, stderr } = await execFileAsync(
    python.command,
    [...python.args, "-c", script, ...args],
    {
      maxBuffer: WCX_MAX_BUFFER,
    },
  )

  const payload = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast(Boolean)

  if (!payload) {
    throw new Error(firstNonemptyLine(stderr) || "Python did not return a JSON payload.")
  }

  return JSON.parse(payload) as T
}

const runWcx = async (wcxPath: string, args: string[]) => {
  try {
    const { stdout, stderr } = await execFileAsync(wcxPath, args, {
      maxBuffer: WCX_MAX_BUFFER,
    })
    return { stdout, stderr }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: string | number }
    const message =
      getUsefulErrorMessage(err.stderr, err.stdout, err.message) ||
      `wcx exited with code ${err.code ?? "unknown"}`
    throw new Error(message)
  }
}

const READ_STATUS_PY = String.raw`
import json
import os
import sqlite3
import sys

db_path = sys.argv[1]
result = {"accountCount": 0, "articleCount": 0, "contentCount": 0}

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        result["accountCount"] = cur.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        result["articleCount"] = cur.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        result["contentCount"] = cur.execute("""
            SELECT COUNT(*) FROM articles
            WHERE NULLIF(TRIM(COALESCE(content_md, '')), '') IS NOT NULL
               OR NULLIF(TRIM(COALESCE(content_html, '')), '') IS NOT NULL
        """).fetchone()[0]
    finally:
        conn.close()

print(json.dumps(result, ensure_ascii=False))
`

const READ_FETCH_RESULT_PY = String.raw`
import json
import os
import sqlite3
import sys

db_path = sys.argv[1]
query = sys.argv[2].strip()
limit = int(sys.argv[3])

if not os.path.exists(db_path):
    print(json.dumps({"account": None, "articles": []}, ensure_ascii=False))
    raise SystemExit

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

def account_to_dict(row):
    if row is None:
        return None
    return {
        "fakeid": row["fakeid"],
        "nickname": row["nickname"],
        "alias": row["alias"],
        "signature": row["signature"],
        "avatar": row["round_head_img"],
        "articleCount": row["article_count"],
    }

try:
    account = conn.execute("""
        SELECT a.fakeid, a.nickname, a.alias, a.signature, a.round_head_img,
               COUNT(art.aid) AS article_count
        FROM accounts a
        LEFT JOIN articles art ON art.fakeid = a.fakeid
        WHERE a.fakeid = ? OR a.nickname = ? OR a.alias = ?
        GROUP BY a.fakeid
        ORDER BY a.updated_at DESC
        LIMIT 1
    """, (query, query, query)).fetchone()

    if account is None:
        account = conn.execute("""
            SELECT a.fakeid, a.nickname, a.alias, a.signature, a.round_head_img,
                   COUNT(art.aid) AS article_count
            FROM accounts a
            LEFT JOIN articles art ON art.fakeid = a.fakeid
            GROUP BY a.fakeid
            ORDER BY a.updated_at DESC
            LIMIT 1
        """).fetchone()

    articles = []
    if account is not None:
        rows = conn.execute("""
            SELECT aid, fakeid, title, link, digest, cover, author, create_time,
                   content_html, content_md
            FROM articles
            WHERE fakeid = ?
            ORDER BY create_time DESC
            LIMIT ?
        """, (account["fakeid"], limit)).fetchall()
        for row in rows:
            articles.append({
                "aid": row["aid"],
                "fakeid": row["fakeid"],
                "title": row["title"],
                "link": row["link"],
                "digest": row["digest"],
                "cover": row["cover"],
                "author": row["author"],
                "createTime": row["create_time"],
                "contentHtml": row["content_html"],
                "contentMd": row["content_md"],
            })

    print(json.dumps({"account": account_to_dict(account), "articles": articles}, ensure_ascii=False))
finally:
    conn.close()
`

export class WxmpService extends IpcService {
  static override readonly groupName = "wxmp"

  @IpcMethod()
  async status(): Promise<WxmpStatus> {
    const [wcxPath, config] = await Promise.all([locateWcx(), readWcxConfig()])
    const cacheDbPath = getWcxCacheDbPath()
    const token = config?.token?.trim() || ""
    const cookie = config?.cookie?.trim() || ""
    const loggedIn = Boolean(token && cookie)
    let account = config?.account || null

    if (loggedIn && !account) {
      try {
        account = await fetchWxmpLoginAccount(token, cookie)
        if (account) {
          await writeWcxConfig({ ...config, token, cookie, account })
        }
      } catch {
        // Login remains usable when account metadata cannot be refreshed.
      }
    }

    let counts = {
      accountCount: 0,
      articleCount: 0,
      contentCount: 0,
    }

    try {
      counts = await runPythonJson<typeof counts>(wcxPath, READ_STATUS_PY, [cacheDbPath])
    } catch {
      // Empty or incompatible caches should not prevent the UI from opening.
    }

    return {
      wcxPath,
      configPath: getWcxConfigPath(),
      cacheDbPath,
      loggedIn,
      token: token || null,
      account,
      ...counts,
    }
  }

  @IpcMethod()
  async openLogin(context: IpcContext): Promise<WxmpStatus> {
    const parent = BrowserWindow.fromWebContents(context.sender) || undefined
    const loginWindow = new BrowserWindow({
      parent,
      width: 960,
      height: 720,
      title: LOGIN_WINDOW_TITLE,
      center: true,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const resolveStatus = () => this.status()

    return new Promise<WxmpStatus>((resolve, reject) => {
      let settled = false

      const settle = async (fn: () => Promise<WxmpStatus>) => {
        if (settled) return
        settled = true
        try {
          resolve(await fn())
        } catch (error) {
          reject(error)
        } finally {
          if (!loginWindow.isDestroyed()) {
            loginWindow.close()
          }
        }
      }

      const tryCapture = (rawUrl: string) => {
        let parsed: URL
        try {
          parsed = new URL(rawUrl)
        } catch {
          return
        }

        const host = parsed.hostname
        if (!host.endsWith("weixin.qq.com") && !host.endsWith("qq.com")) return

        const token = parsed.searchParams.get("token")
        if (!token) return

        setTimeout(() => {
          void settle(async () => {
            const cookies = await loginWindow.webContents.session.cookies.get({
              url: LOGIN_URL,
            })
            const cookie = cookies
              .filter((item) => item.name && item.value)
              .map((item) => `${item.name}=${item.value}`)
              .join("; ")

            if (!cookie) {
              throw new Error("No mp.weixin.qq.com cookies were captured.")
            }

            await writeWcxConfig({ token, cookie })
            return resolveStatus()
          })
        }, 800)
      }

      loginWindow.webContents.on("will-navigate", (_event, url) => tryCapture(url))
      loginWindow.webContents.on("did-navigate", (_event, url) => tryCapture(url))
      loginWindow.webContents.on("did-redirect-navigation", (_event, url) => tryCapture(url))
      loginWindow.on("closed", () => {
        void settle(resolveStatus)
      })

      loginWindow.loadURL(LOGIN_URL).catch((error) => {
        void settle(async () => {
          throw error
        })
      })
    })
  }

  @IpcMethod()
  async logout(): Promise<WxmpStatus> {
    await Promise.all([
      fsp.rm(getWcxConfigPath(), { force: true }),
      session.defaultSession.clearStorageData({
        origin: new URL(LOGIN_URL).origin,
        storages: ["cookies"],
      }),
    ])
    return this.status()
  }

  @IpcMethod()
  async selectWcxBinary(context: IpcContext): Promise<WxmpStatus> {
    const parent = BrowserWindow.fromWebContents(context.sender) || undefined
    const dialogOptions: Electron.OpenDialogOptions = {
      title: "Select wcx",
      properties: ["openFile"],
      defaultPath: path.join(getHomeDir(), ".local", "bin", "wcx"),
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return this.status()
    }

    const selected = result.filePaths[0]!
    const resolved = await probeWcx(selected)
    if (!resolved) {
      throw new Error("Selected file is not a working wcx executable.")
    }

    store.set(StoreKey.WxmpWcxPath, resolved)
    return this.status()
  }

  @IpcMethod()
  async fetchChannel(_context: IpcContext, input: WxmpFetchInput): Promise<WxmpFetchResult> {
    const query = input.query.trim()
    if (!query) {
      throw new Error("Missing WeChat Official Account name or fakeid.")
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), 500)
    const wcxPath = await locateWcx()
    if (!wcxPath) {
      throw new Error("wcx was not found. Install wcx or set WCX_BIN.")
    }

    const args = ["fetch", query, "--limit", String(limit)]
    if (input.withContent) {
      args.push("--content")
    }

    const { stdout, stderr } = await runWcx(wcxPath, args)
    const payload = await runPythonJson<WcxCachePayload>(wcxPath, READ_FETCH_RESULT_PY, [
      getWcxCacheDbPath(),
      query,
      String(limit),
    ])

    if (!payload.account) {
      throw new Error("wcx completed, but no account was found in the local cache.")
    }

    return {
      account: payload.account,
      articles: payload.articles,
      stdout,
      stderr,
    }
  }

  @IpcMethod()
  async tryFetchChannel(
    context: IpcContext,
    input: WxmpFetchInput,
  ): Promise<WxmpFetchResult | null> {
    try {
      const result = await this.fetchChannel(context, input)
      return isWxmpAccountSearchMatch(result.account, input.query) ? result : null
    } catch {
      return null
    }
  }
}
