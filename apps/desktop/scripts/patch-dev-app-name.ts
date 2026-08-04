/**
 * In dev the app runs from the prebuilt Electron binary, whose Info.plist has
 * CFBundleName = "Electron". On macOS the menu bar app name is read from this
 * plist at launch (before any JS runs), so app.setName() can't change it.
 * This script patches the binary's Info.plist so the dev menu bar shows the
 * product name instead of "Electron".
 */
/* eslint-disable unicorn/no-process-exit -- This file runs as a build CLI. */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"

import path from "pathe"

import pkg from "../package.json" with { type: "json" }

if (process.platform !== "darwin") {
  process.exit(0)
}

const appName = pkg.productName

const require = createRequire(import.meta.url)
// The "electron" package's main export is the path to the executable binary.
const electronBinary = require("electron") as string
// .../dist/Electron.app/Contents/MacOS/Electron -> .../Contents/Info.plist
const infoPlist = path.join(electronBinary, "..", "..", "Info.plist")

if (!fs.existsSync(infoPlist)) {
  console.warn(`[patch-dev-app-name] Info.plist not found at ${infoPlist}, skip`)
  process.exit(0)
}

for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  execFileSync("plutil", ["-replace", key, "-string", appName, infoPlist])
}

console.info(`[patch-dev-app-name] set Electron app name to "${appName}"`)
