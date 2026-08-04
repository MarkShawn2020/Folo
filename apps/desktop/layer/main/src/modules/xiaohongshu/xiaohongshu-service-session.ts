import fsp from "node:fs/promises"

import path from "pathe"

export const getXiaohongshuServicePaths = (userDataPath: string, serviceVersion: string) => {
  const rootDirectory = path.join(userDataPath, "managed-tools", "xiaohongshu-mcp")
  const versionDirectory = path.join(rootDirectory, serviceVersion)
  const dataDirectory = path.join(rootDirectory, "data")

  return {
    versionDirectory,
    dataDirectory,
    legacyCookiePath: path.join(versionDirectory, "cookies.json"),
    cookiePath: path.join(dataDirectory, "cookies.json"),
  }
}

export const prepareXiaohongshuServiceData = async ({
  dataDirectory,
  cookiePath,
  legacyCookiePath,
}: ReturnType<typeof getXiaohongshuServicePaths>) => {
  await fsp.mkdir(dataDirectory, { recursive: true })

  try {
    await fsp.access(cookiePath)
    return
  } catch {
    // Continue with the one-time migration from the legacy versioned directory.
  }

  try {
    await fsp.copyFile(legacyCookiePath, cookiePath)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return
    }
    throw error
  }
}

export const hasCachedXiaohongshuServiceSession = async ({
  cookiePath,
  legacyCookiePath,
}: ReturnType<typeof getXiaohongshuServicePaths>) => {
  for (const candidate of [cookiePath, legacyCookiePath]) {
    try {
      const stat = await fsp.stat(candidate)
      if (stat.isFile() && stat.size > 2) {
        return true
      }
    } catch {
      // Continue checking the other supported cache location.
    }
  }
  return false
}
