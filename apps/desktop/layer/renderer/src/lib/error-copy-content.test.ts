import { describe, expect, it } from "vitest"

import { getErrorCopyContent } from "./error-copy-content"

describe("getErrorCopyContent", () => {
  it("combines the visible error details without duplicating the title", () => {
    expect(
      getErrorCopyContent({
        title: "Unable to save",
        message: "Unable to save",
        reason: "The server rejected the request.",
      }),
    ).toBe("Unable to save\nThe server rejected the request.")
  })

  it("keeps a separate title and message on separate lines", () => {
    expect(
      getErrorCopyContent({
        title: "Save failed",
        message: "The server rejected the request.",
      }),
    ).toBe("Save failed\nThe server rejected the request.")
  })

  it("ignores empty parts", () => {
    expect(getErrorCopyContent({ title: "  ", message: "Details" })).toBe("Details")
  })
})
