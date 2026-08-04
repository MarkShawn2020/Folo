import { isBizId } from "@follow/utils/utils"

import { ROUTE_FEED_PENDING } from "~/constants/app"

type LocalEntryVisibility = {
  id: string
  read?: boolean | null
}

export const shouldFetchRemoteEntries = ({
  feedId,
  folderFeedIds,
  inboxId,
  listId,
  isCollection,
}: {
  feedId?: string
  folderFeedIds: string[]
  inboxId?: string
  listId?: string
  isCollection: boolean
}) => {
  if (isCollection || inboxId || listId || !feedId || feedId === ROUTE_FEED_PENDING) {
    return true
  }

  const scopedFeedIds = folderFeedIds.length > 0 ? folderFeedIds : [feedId]
  return scopedFeedIds.some(isBizId)
}

export const getVisibleLocalEntryIds = <TEntry extends LocalEntryVisibility>({
  sourceIds,
  entries,
  stickyVisibleIds,
  unreadOnly,
}: {
  sourceIds: string[]
  entries: Record<string, TEntry | null | undefined>
  stickyVisibleIds?: ReadonlySet<string>
  unreadOnly: boolean
}) => {
  return sourceIds.filter((id) => {
    const entry = entries[id]

    if (!entry) return false
    if (unreadOnly && !!entry.read && !stickyVisibleIds?.has(entry.id)) {
      return false
    }

    return true
  })
}
