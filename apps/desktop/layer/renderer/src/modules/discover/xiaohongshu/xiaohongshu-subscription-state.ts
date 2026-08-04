export const addAccountTask = (tasks: ReadonlySet<string>, userId: string) => {
  const nextTasks = new Set(tasks)
  nextTasks.add(userId)
  return nextTasks
}

export const removeAccountTask = (tasks: ReadonlySet<string>, userId: string) => {
  const nextTasks = new Set(tasks)
  nextTasks.delete(userId)
  return nextTasks
}

export const getAccountSubscriptionState = ({
  userId,
  syncingUserIds,
  subscribedUserIds,
}: {
  userId: string
  syncingUserIds: ReadonlySet<string>
  subscribedUserIds: ReadonlySet<string>
}) => {
  const isSyncing = syncingUserIds.has(userId)
  const isSubscribed = subscribedUserIds.has(userId)
  return {
    isSyncing,
    isSubscribed,
    isDisabled: isSyncing || isSubscribed,
  }
}
