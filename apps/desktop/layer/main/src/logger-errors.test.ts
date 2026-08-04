import { describe, expect, it } from "vitest"

import { isDisconnectedStreamError } from "./logger-errors"

describe("isDisconnectedStreamError", () => {
  it.each(["EIO", "EPIPE"])("recognizes %s as a disconnected output stream", (code) => {
    expect(isDisconnectedStreamError(Object.assign(new Error(`write ${code}`), { code }))).toBe(
      true,
    )
  })

  it("preserves unrelated stream errors", () => {
    expect(
      isDisconnectedStreamError(Object.assign(new Error("permission denied"), { code: "EACCES" })),
    ).toBe(false)
    expect(isDisconnectedStreamError(new Error("unknown"))).toBe(false)
  })
})
