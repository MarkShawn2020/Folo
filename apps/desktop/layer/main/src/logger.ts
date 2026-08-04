import { app, shell } from "electron"
import log from "electron-log"

import { isDisconnectedStreamError } from "./logger-errors"

export const logger = log.scope("main")
log.initialize()

// electron-log's console transport writes directly to process.stdout. A detached
// terminal can report either EPIPE or EIO, depending on how its PTY was closed.
// Disable only the console transport after detachment; file logging remains active.
const disableConsoleTransport = () => {
  log.transports.console.level = false
}

const originalWriteFn = log.transports.console.writeFn
log.transports.console.writeFn = (opts) => {
  try {
    originalWriteFn(opts)
  } catch (error) {
    if (!isDisconnectedStreamError(error)) throw error
    disableConsoleTransport()
  }
}

// Belt-and-suspenders: some native code paths bypass electron-log entirely
// and write to stdout/stderr directly.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (!isDisconnectedStreamError(error)) throw error
    disableConsoleTransport()
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
  disableConsoleTransport()
})

app.on("will-quit", () => {
  logger.info("App will quit")
})
