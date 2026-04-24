import { app, shell } from "electron"
import log from "electron-log"

export const logger = log.scope("main")
log.initialize()

// electron-log's console transport writes directly to process.stdout,
// which throws EPIPE when the pipe is closed (common in `pnpm dev:electron`
// where stdout is piped through turbo/pnpm). Swallow write errors so they
// don't surface as "Uncaught Exception" dialogs in dev.
const originalWriteFn = log.transports.console.writeFn
log.transports.console.writeFn = (opts) => {
  try {
    originalWriteFn(opts)
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "EPIPE") throw e
  }
}

// Belt-and-suspenders: some native code paths bypass electron-log entirely
// and write to stdout/stderr directly. Swallow EPIPE there too.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code !== "EPIPE") throw e
  })
}

export function getLogFilePath() {
  return log.transports.file.getFile().path
}

export async function revealLogFile() {
  const filePath = getLogFilePath()
  return await shell.openPath(filePath)
}

app.on("before-quit", () => {
  logger.info("App is quitting")
  log.transports.console.level = false
})

app.on("will-quit", () => {
  logger.info("App will quit")
})
