import { useIsDark } from "@follow/hooks"
import * as React from "react"
import { Toaster as Sonner } from "sonner"

import { ZIndexProvider } from "../z-index"
import { bridgeToastInspectorSource } from "./inspector"
import { toastStyles } from "./styles"

type ToasterProps = React.ComponentProps<typeof Sonner>
const TOAST_Z_INDEX = 999999999

export const Toaster = ({ ...props }: ToasterProps) => {
  const isDark = useIsDark()
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    return bridgeToastInspectorSource(container)
  }, [])

  return (
    <ZIndexProvider zIndex={TOAST_Z_INDEX}>
      <div ref={containerRef} className="contents">
        <Sonner
          theme={isDark ? "dark" : "light"}
          gap={12}
          toastOptions={{
            unstyled: true,
            classNames: toastStyles,
          }}
          icons={{
            success: <i className="i-mgc-check-circle-cute-re" />,
            error: <i className="i-mgc-close-cute-re" />,
            warning: <i className="i-mgc-warning-cute-re" />,
            info: <i className="i-mgc-information-cute-re" />,
            loading: <i className="i-mgc-loading-3-cute-re animate-spin" />,
          }}
          {...props}
        />
      </div>
    </ZIndexProvider>
  )
}
