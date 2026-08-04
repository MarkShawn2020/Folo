import { describe, expect, it } from "vitest"

import { shouldShowEntryNotFound } from "./entry-content-fallback-state"

describe("entry content fallback state", () => {
  it("keeps a locally imported entry visible when no remote entry exists", () => {
    expect(
      shouldShowEntryNotFound({
        hasLocalEntry: true,
        loadingRemoteEntry: false,
        hasRemoteEntry: false,
      }),
    ).toBe(false)
  })

  it("shows not found only after both local and remote sources are empty", () => {
    expect(
      shouldShowEntryNotFound({
        hasLocalEntry: false,
        loadingRemoteEntry: false,
        hasRemoteEntry: false,
      }),
    ).toBe(true)
  })
})
