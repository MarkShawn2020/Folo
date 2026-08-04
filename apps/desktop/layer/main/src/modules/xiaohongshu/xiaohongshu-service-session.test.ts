import fsp from "node:fs/promises"
import os from "node:os"

import path from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import {
  getXiaohongshuServicePaths,
  hasCachedXiaohongshuServiceSession,
  prepareXiaohongshuServiceData,
} from "./xiaohongshu-service-session"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fsp.rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

const createTemporaryDirectory = async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "folo-xhs-session-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("Xiaohongshu managed service session", () => {
  it("keeps cookies in a stable data directory across service versions", async () => {
    const userDataPath = await createTemporaryDirectory()
    const paths = getXiaohongshuServicePaths(userDataPath, "v2.2.6")
    await fsp.mkdir(paths.versionDirectory, { recursive: true })
    await fsp.writeFile(paths.legacyCookiePath, "persisted-cookie")

    await prepareXiaohongshuServiceData(paths)

    await expect(fsp.readFile(paths.cookiePath, "utf8")).resolves.toBe("persisted-cookie")
    await expect(hasCachedXiaohongshuServiceSession(paths)).resolves.toBe(true)
    expect(paths.cookiePath).toBe(
      path.join(userDataPath, "managed-tools", "xiaohongshu-mcp", "data", "cookies.json"),
    )
  })

  it("does not overwrite a newer stable cookie cache", async () => {
    const userDataPath = await createTemporaryDirectory()
    const paths = getXiaohongshuServicePaths(userDataPath, "v2.2.6")
    await fsp.mkdir(paths.versionDirectory, { recursive: true })
    await fsp.mkdir(paths.dataDirectory, { recursive: true })
    await fsp.writeFile(paths.legacyCookiePath, "legacy-cookie")
    await fsp.writeFile(paths.cookiePath, "current-cookie")

    await prepareXiaohongshuServiceData(paths)

    await expect(fsp.readFile(paths.cookiePath, "utf8")).resolves.toBe("current-cookie")
  })

  it("reports an empty service directory as signed out", async () => {
    const userDataPath = await createTemporaryDirectory()
    const paths = getXiaohongshuServicePaths(userDataPath, "v2.2.6")

    await expect(hasCachedXiaohongshuServiceSession(paths)).resolves.toBe(false)
  })
})
