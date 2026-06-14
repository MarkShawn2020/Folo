/**
 * Custom electron-vite dev runner.
 *
 * Why this exists instead of plain `electron-vite dev`:
 * electron-vite's dev server spawns Electron and hardcodes
 * `ps.on("close", process.exit)`. So when the app self-quits (e.g. the
 * "Restart" menu does `app.relaunch(); app.quit()`), the whole CLI process —
 * including the renderer Vite dev server — exits. A relaunched Electron then
 * points at a dead `http://localhost:5173` and shows a blank page.
 *
 * This runner reproduces electron-vite's dev flow 1:1 (it uses the very same
 * vite `build`/`createServer`/`mergeConfig` + electron-vite `resolveConfig`),
 * but owns the Electron process itself: when Electron exits with
 * RELAUNCH_EXIT_CODE it respawns Electron while keeping the renderer dev server
 * alive — a real main-process restart that comes back in dev. Any other exit
 * code tears everything down as before.
 *
 * The renderer requests this via `app.exit(RELAUNCH_EXIT_CODE)` in dev — keep
 * the constant in sync with layer/main/src/menu.ts.
 */
import { type ChildProcess, spawn } from "node:child_process"

import electronPath from "electron"
import { resolveConfig } from "electron-vite"
import { build, createLogger, createServer as createViteServer, mergeConfig } from "vite"

// Keep in sync with RELAUNCH_EXIT_CODE in layer/main/src/menu.ts
const RELAUNCH_EXIT_CODE = 77

const logger = createLogger()

const resolveHostname = (host: string | boolean | undefined): string => {
  if (host === undefined || host === false || host === true) return "localhost"
  if (host === "0.0.0.0" || host === "::" || host === "::1") return "localhost"
  return host
}

const doBuild = (config: any, watchHook: () => void): Promise<void> =>
  new Promise((resolve) => {
    if (config.build?.watch) {
      let firstBundle = true
      const merged = mergeConfig(config, {
        plugins: [
          {
            name: "electron-dev:watcher",
            closeBundle() {
              if (firstBundle) {
                firstBundle = false
                resolve()
              } else {
                watchHook()
              }
            },
          },
        ],
      })
      build(merged).catch((e) => logger.error(`${e}`))
    } else {
      build(config)
        .then(() => resolve())
        .catch((e) => {
          logger.error(`${e}`)
          resolve()
        })
    }
  })

const main = async () => {
  process.env.NODE_ENV_ELECTRON_VITE = "development"

  const { config } = (await resolveConfig(
    { root: process.cwd() },
    "serve",
    "development",
  )) as any

  let electron: ChildProcess | undefined
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | undefined

  const startElectron = (): ChildProcess => {
    const child = spawn(electronPath as unknown as string, ["."], {
      stdio: "inherit",
      env: process.env,
    })
    child.on("close", (code) => {
      if (code === RELAUNCH_EXIT_CODE) {
        logger.info("\nrestarting electron (keeping renderer dev server)...")
        electron = startElectron()
      } else {
        process.exit(code ?? 0)
      }
    })
    return child
  }

  if (config?.main) {
    await doBuild(config.main, () => {
      if (!electron) return
      electron.removeAllListeners()
      electron.kill()
      electron = startElectron()
    })
  }

  if (config?.preload) {
    await doBuild(config.preload, () => {
      viteServer?.ws.send({ type: "full-reload" })
    })
  }

  if (config?.renderer) {
    viteServer = await createViteServer(config.renderer)
    if (!viteServer.httpServer) throw new Error("Renderer HTTP server not available")
    await viteServer.listen()
    const conf = viteServer.config.server
    const protocol = conf.https ? "https:" : "http:"
    const host = resolveHostname(conf.host as string | boolean | undefined)
    process.env.ELECTRON_RENDERER_URL = `${protocol}//${host}:${conf.port}`
    viteServer.printUrls()
  }

  electron = startElectron()
}

main().catch((e) => {
  logger.error(`${e?.stack || e}`)
  process.exit(1)
})
