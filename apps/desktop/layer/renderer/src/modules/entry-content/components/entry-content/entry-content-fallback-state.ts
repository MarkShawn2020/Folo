export const shouldShowEntryNotFound = ({
  hasLocalEntry,
  loadingRemoteEntry,
  hasRemoteEntry,
}: {
  hasLocalEntry: boolean
  loadingRemoteEntry: boolean
  hasRemoteEntry: boolean
}) => !hasLocalEntry && !loadingRemoteEntry && !hasRemoteEntry
