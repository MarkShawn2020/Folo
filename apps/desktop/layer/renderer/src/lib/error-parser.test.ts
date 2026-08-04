import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { toastError } from "./error-parser"

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}))

vi.mock("i18next", () => ({
  t: (key: string) => key,
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}))

vi.mock("~/atoms/server-configs", () => ({
  getIsPaymentEnabled: () => false,
}))

vi.mock("~/components/ui/button/CopyButton", () => ({
  CopyButton: "copy-button",
}))

vi.mock("~/components/ui/markdown/Markdown", () => ({
  Markdown: "markdown",
}))

vi.mock("~/modules/debug/registry", () => ({
  DebugRegistry: {
    add: vi.fn(),
  },
}))

describe("toastError", () => {
  beforeEach(() => {
    toastErrorMock.mockReset()
  })

  it("adds a copy button containing the complete error message", () => {
    const message = "Error invoking remote method 'wxmp.logout': Error: No handler registered"

    toastError(message)

    const options = toastErrorMock.mock.calls[0]?.[1] as {
      description: ReactElement<{ children: Array<ReactElement | undefined> }>
    }
    const copyButton = options.description.props.children.at(-1) as
      | ReactElement<{ value: string }>
      | undefined

    expect(copyButton?.type).toBe("copy-button")
    expect(copyButton?.props.value).toBe(message)
  })
})
