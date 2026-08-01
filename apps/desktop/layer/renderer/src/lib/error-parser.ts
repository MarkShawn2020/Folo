import { cn } from "@follow/utils/utils"
import { FollowAPIError } from "@follow-app/client-sdk"
import { t } from "i18next"
import { FetchError } from "ofetch"
import type { ReactNode } from "react"
import { createElement } from "react"
import type { ExternalToast } from "sonner"
import { toast } from "sonner"

import { getIsPaymentEnabled } from "~/atoms/server-configs"
import { CopyButton } from "~/components/ui/button/CopyButton"
import { Markdown } from "~/components/ui/markdown/Markdown"
import { DebugRegistry } from "~/modules/debug/registry"

import { getErrorCopyContent } from "./error-copy-content"

export const getFetchErrorInfo = (
  error: Error,
): {
  message: string
  code?: number
} => {
  if (error instanceof FetchError) {
    try {
      const json = JSON.parse(error.response?._data)

      const { reason, code, message } = json
      const i18nKey = `errors:${code}` as any
      const i18nMessage = t(i18nKey) === i18nKey ? message : t(i18nKey)
      return {
        message: `${i18nMessage}${reason ? `: ${reason}` : ""}`,
        code,
      }
    } catch {
      return { message: error.message }
    }
  }

  if (error instanceof FollowAPIError && error.code) {
    const code = Number(error.code)
    try {
      const i18nKey = `errors:${code}` as any
      const i18nMessage = t(i18nKey) === i18nKey ? error.message : t(i18nKey)
      return {
        message: i18nMessage,
        code,
      }
    } catch {
      return { message: error.message }
    }
  }

  return { message: error.message }
}

export const getFetchErrorMessage = (error: Error) => {
  const { message } = getFetchErrorInfo(error)
  return message
}

const createErrorToastDescription = (copyContent: string, description?: ReactNode) =>
  createElement("div", { className: "flex min-w-0 items-start gap-2" }, [
    description ? createElement("div", { className: "min-w-0 flex-1" }, description) : undefined,
    createElement(CopyButton, {
      "aria-label": t("common:words.copy"),
      className: cn(
        "relative z-[1] shrink-0 border-transparent bg-theme-background text-text opacity-60 transition-opacity",
        "hover:bg-material-ultra-thick hover:opacity-100 focus:border-text-tertiary",
      ),
      key: "copy",
      title: t("common:words.copy"),
      value: copyContent,
    }),
  ])

export const toastError = (message?: string, toastOptions: ExternalToast = {}) => {
  const title = message || "Unknown error occurred"
  const description =
    typeof toastOptions.description === "function"
      ? toastOptions.description()
      : toastOptions.description

  return toast.error(title, {
    ...toastOptions,
    description: createErrorToastDescription(
      getErrorCopyContent({
        title,
        reason: typeof description === "string" ? description : undefined,
      }),
      description,
    ),
  })
}

/**
 * Just a wrapper around `toastFetchError` to create a function that can be used as a callback.
 */
export const createErrorToaster = (title?: string, toastOptions?: ExternalToast) => (err: Error) =>
  toastFetchError(err, { title, ...toastOptions })

export const toastFetchError = (
  error: Error,
  { title: _title, ..._toastOptions }: ExternalToast & { title?: string } = {},
) => {
  let message = ""
  let _reason = ""
  let code: number | undefined

  let status: number | undefined
  if (error instanceof FetchError) {
    try {
      status = error.statusCode ? Number(error.statusCode) : undefined
      const json =
        typeof error.response?._data === "string"
          ? JSON.parse(error.response?._data)
          : error.response?._data

      const { reason, code: _code, message: _message } = json
      code = _code
      message = _message

      const tValue = t(`errors:${code}` as any)
      const i18nMessage = tValue === code?.toString() ? message : tValue

      message = i18nMessage

      if (reason) {
        _reason = reason
      }
    } catch {
      message = error.message
    }
  }

  if (error instanceof FollowAPIError) {
    code = error.code ? Number(error.code) : undefined
    status = error.status ? Number(error.status) : undefined
    message = error.message
  }

  if ("code" in error && error.code) {
    code = Number(error.code)
    try {
      const tValue = t(`errors:${code}` as any)
      const i18nMessage = tValue === code?.toString() ? error.message : tValue
      message = i18nMessage
    } catch {
      message = error.message
    }
  }

  // 2fa errors are handled by the form
  if (code === 4007 || code === 4008) {
    return
  }

  const toastOptions: ExternalToast = {
    ..._toastOptions,
    classNames: {
      toast: "items-start bg-theme-background",

      content: "w-full",
      ..._toastOptions.classNames,
    },
  }

  if (!_reason) {
    const title = _title || message || "Unknown error occurred"
    const copyContent = getErrorCopyContent({
      title,
      message: _title ? message : undefined,
    })
    const isPaymentEnabled = getIsPaymentEnabled()
    const needUpgradeError = status && isPaymentEnabled ? status === 402 : false
    const description = needUpgradeError
      ? "Please upgrade your plan."
      : _title
        ? message
        : undefined
    toastOptions.description = createErrorToastDescription(copyContent, description)
    return toast.error(title, {
      ...toastOptions,
      action: needUpgradeError
        ? {
            label: "Upgrade",
            onClick: () => {
              window.router.showSettings({ tab: "plan" })
            },
          }
        : undefined,
    })
  } else {
    const title = message || _title || "Unknown error occurred"
    const copyContent = getErrorCopyContent({ title, reason: _reason })
    return toast.error(title, {
      duration: 5000,
      ...toastOptions,
      description: createErrorToastDescription(copyContent, [
        createElement(Markdown, {
          className: "text-sm opacity-70 min-w-0 flex-1 mt-1",
          key: "reason",
          children: _reason,
        }),
      ]),
    })
  }
}
DebugRegistry.add("Simulate request error", () => {
  createErrorToaster(
    "Simulated request error",
    {},
  )({
    response: {
      _data: JSON.stringify({
        code: 1000,
        message: "Simulated request error",
        reason: "Simulated reason",
      }),
    },
  } as any)
})

DebugRegistry.add("Simulate payment need upgrade error", () => {
  createErrorToaster(
    "Simulated payment need upgrade error",
    {},
  )(
    new FollowAPIError("Simulated payment need upgrade error", 402, "1111", {
      reason: "Simulated reason",
    }),
  )
})
