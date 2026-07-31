const INSPECTOR_SOURCE_ATTRIBUTE = "data-insp-path"
const SONNER_TOAST_SELECTOR = "[data-sonner-toast]"

const syncInspectorSource = (container: HTMLElement, sourcePath: string) => {
  container.querySelectorAll<HTMLElement>(SONNER_TOAST_SELECTOR).forEach((toast) => {
    toast.setAttribute(INSPECTOR_SOURCE_ATTRIBUTE, sourcePath)
  })
}

export const bridgeToastInspectorSource = (container: HTMLElement) => {
  const sourcePath = container.getAttribute(INSPECTOR_SOURCE_ATTRIBUTE)
  if (!sourcePath) return

  syncInspectorSource(container, sourcePath)

  const observer = new MutationObserver(() => {
    syncInspectorSource(container, sourcePath)
  })
  observer.observe(container, { childList: true, subtree: true })

  return () => observer.disconnect()
}
