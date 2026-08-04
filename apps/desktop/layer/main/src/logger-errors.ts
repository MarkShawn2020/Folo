const DISCONNECTED_STREAM_ERROR_CODES = new Set(["EIO", "EPIPE"])

export function isDisconnectedStreamError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false

  return typeof error.code === "string" && DISCONNECTED_STREAM_ERROR_CODES.has(error.code)
}
