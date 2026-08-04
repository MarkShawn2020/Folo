import { name } from "@pkg"
import { app, protocol } from "electron"
import path from "pathe"

const e2eUserDataDir = process.env.FOLO_E2E_USER_DATA_DIR

if (e2eUserDataDir) {
  app.setPath("userData", e2eUserDataDir)
} else if (import.meta.env.DEV) {
  app.setPath("userData", path.join(app.getPath("appData"), "Folo(dev)"))
}

// In dev the app runs from the Electron binary, so the macOS menu bar would show
// "Electron" as the app name. Force it to the product name.
if (import.meta.env.DEV) {
  app.setName(name)
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      bypassCSP: true,
      supportFetchAPI: true,
      secure: true,
    },
  },
])
