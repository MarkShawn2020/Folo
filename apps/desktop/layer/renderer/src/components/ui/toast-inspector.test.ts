import { bridgeToastInspectorSource } from "@follow/components/ui/toast/inspector.js"
import { describe, expect, test } from "vitest"

const flushMutationObserver = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("bridgeToastInspectorSource", () => {
  test("copies the component source onto existing and new Sonner toasts", async () => {
    const container = document.createElement("div")
    container.dataset.inspPath = "src/ui/toast/index.tsx:24:7:div"

    const existingToast = document.createElement("li")
    existingToast.dataset.sonnerToast = ""
    container.append(existingToast)

    const disconnect = bridgeToastInspectorSource(container)

    expect(existingToast.dataset.inspPath).toBe("src/ui/toast/index.tsx:24:7:div")

    const newToast = document.createElement("li")
    newToast.dataset.sonnerToast = ""
    container.append(newToast)
    await flushMutationObserver()

    expect(newToast.dataset.inspPath).toBe("src/ui/toast/index.tsx:24:7:div")

    disconnect?.()
  })

  test("stays inactive outside an instrumented development build", () => {
    const container = document.createElement("div")
    const toast = document.createElement("li")
    toast.dataset.sonnerToast = ""
    container.append(toast)

    expect(bridgeToastInspectorSource(container)).toBeUndefined()
    expect(toast.dataset.inspPath).toBeUndefined()
  })
})
