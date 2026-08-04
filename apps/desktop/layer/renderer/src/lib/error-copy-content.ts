export const getErrorCopyContent = ({
  title,
  message,
  reason,
}: {
  title?: string
  message?: string
  reason?: string
}) =>
  [title, message !== title ? message : undefined, reason]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n")
