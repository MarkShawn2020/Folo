import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import fsp from "node:fs/promises"

import { app } from "electron"
import path from "pathe"

import { logger } from "~/logger"

import {
  getXiaohongshuServicePaths,
  prepareXiaohongshuServiceData,
} from "./xiaohongshu-service-session"

const SERVICE_VERSION = "v2.2.6"
const SERVICE_START_TIMEOUT = 180_000
const SERVICE_PROBE_INTERVAL = 500
const MIN_BINARY_SIZE = 1024 * 1024

interface RuntimeAsset {
  name: string
  sha256: string
}

const runtimeAssets: Partial<Record<`${NodeJS.Platform}-${string}`, RuntimeAsset>> = {
  "darwin-arm64": {
    name: "xiaohongshu-mcp-darwin-arm64",
    sha256: "1015d95b11a9a545a93bed0fd5d8a71ea4db8cda54acce420470960a935ac3c5",
  },
  "linux-x64": {
    name: "xiaohongshu-mcp-linux-amd64",
    sha256: "dbc39c9cbb76c1d7262f820e57bdd17f90959153b582ae118750167cc39220f3",
  },
  "win32-x64": {
    name: "xiaohongshu-mcp-windows-amd64.exe",
    sha256: "16266fac57d756d1811bd1a6fdc77226e268810296b355d942e1616839fb88e3",
  },
}

let managedProcess: ChildProcess | null = null
let managedStartPromise: Promise<void> | null = null
let hasRegisteredQuitHandler = false

const getRuntimeAsset = () => runtimeAssets[`${process.platform}-${process.arch}`]

const getServicePaths = () => getXiaohongshuServicePaths(app.getPath("userData"), SERVICE_VERSION)

const getDownloadUrl = (asset: RuntimeAsset) =>
  `https://github.com/xpzouying/xiaohongshu-mcp/releases/download/${SERVICE_VERSION}/${asset.name}`

const getFileDigest = async (filePath: string) => {
  const content = await fsp.readFile(filePath)
  return createHash("sha256").update(content).digest("hex")
}

const isValidBinary = async (filePath: string, asset: RuntimeAsset) => {
  try {
    const stat = await fsp.stat(filePath)
    if (!stat.isFile() || stat.size < MIN_BINARY_SIZE) {
      return false
    }
    return (await getFileDigest(filePath)) === asset.sha256
  } catch {
    return false
  }
}

const downloadBinary = async (binaryPath: string, asset: RuntimeAsset) => {
  const temporaryPath = `${binaryPath}.${process.pid}.download`

  await fsp.mkdir(path.dirname(binaryPath), { recursive: true })
  try {
    const response = await fetch(getDownloadUrl(asset), {
      headers: {
        "User-Agent": "Folo",
      },
      redirect: "follow",
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const content = Buffer.from(await response.arrayBuffer())
    const digest = createHash("sha256").update(content).digest("hex")
    if (content.byteLength < MIN_BINARY_SIZE || digest !== asset.sha256) {
      throw new Error("Downloaded file failed integrity verification")
    }

    await fsp.writeFile(temporaryPath, content, { mode: 0o755 })
    await fsp.rename(temporaryPath, binaryPath)
    if (process.platform !== "win32") {
      await fsp.chmod(binaryPath, 0o755)
    }
  } catch (error) {
    await fsp.rm(temporaryPath, { force: true })
    throw new Error("小红书搜索服务下载失败，请检查网络后重试。", { cause: error })
  }
}

const resolveBinary = async () => {
  const configuredBinary = process.env.XIAOHONGSHU_MCP_BINARY?.trim()
  if (configuredBinary) {
    await fsp.access(configuredBinary)
    return configuredBinary
  }

  const asset = getRuntimeAsset()
  if (!asset) {
    throw new Error(
      `当前系统暂不支持自动启动小红书搜索服务（${process.platform}/${process.arch}）。`,
    )
  }

  const binaryPath = path.join(getServicePaths().versionDirectory, asset.name)
  if (!(await isValidBinary(binaryPath, asset))) {
    await downloadBinary(binaryPath, asset)
  }
  return binaryPath
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const canConnect = async (endpoint: string) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 2_000)

  try {
    await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

const waitForService = async (
  endpoint: string,
  child: ChildProcess,
  getLaunchError: () => Error | null,
) => {
  const deadline = Date.now() + SERVICE_START_TIMEOUT
  while (Date.now() < deadline) {
    if (await canConnect(endpoint)) {
      return
    }
    const launchError = getLaunchError()
    if (launchError) {
      throw new Error("小红书搜索服务启动失败。", { cause: launchError })
    }
    if (child.exitCode !== null) {
      throw new Error(`小红书搜索服务启动失败（退出码 ${child.exitCode}）。`)
    }
    await delay(SERVICE_PROBE_INTERVAL)
  }

  throw new Error("小红书搜索服务启动超时，请检查网络后重试。")
}

const registerQuitHandler = () => {
  if (hasRegisteredQuitHandler) return

  hasRegisteredQuitHandler = true
  app.once("before-quit", () => {
    managedProcess?.kill()
    managedProcess = null
  })
}

const startManagedService = async (endpoint: string) => {
  if (await canConnect(endpoint)) {
    return
  }

  const binaryPath = await resolveBinary()
  const servicePaths = getServicePaths()
  await prepareXiaohongshuServiceData(servicePaths)
  const child = spawn(binaryPath, [], {
    cwd: servicePaths.dataDirectory,
    env: process.env,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  })
  managedProcess = child
  registerQuitHandler()
  let launchError: Error | null = null

  child.stderr?.on("data", (chunk: Buffer) => {
    logger.info(`[xiaohongshu-mcp] ${chunk.toString().trimEnd()}`)
  })
  child.once("error", (error) => {
    launchError = error
    logger.error("Failed to start xiaohongshu-mcp", error)
  })
  child.once("exit", (code, signal) => {
    logger.info(`xiaohongshu-mcp exited`, { code, signal })
    if (managedProcess === child) {
      managedProcess = null
    }
  })

  await waitForService(endpoint, child, () => launchError)
}

export const ensureLocalXiaohongshuMCP = async (endpoint: string) => {
  managedStartPromise ??= startManagedService(endpoint).finally(() => {
    managedStartPromise = null
  })
  await managedStartPromise
}
