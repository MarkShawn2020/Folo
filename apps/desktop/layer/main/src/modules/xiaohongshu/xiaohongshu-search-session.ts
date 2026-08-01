const searchControllers = new Map<string, AbortController>()

export const runCancellableXiaohongshuSearch = async <T>(
  requestId: string | undefined,
  search: (signal?: AbortSignal) => Promise<T>,
) => {
  if (!requestId) {
    return search()
  }

  searchControllers.get(requestId)?.abort()
  const controller = new AbortController()
  searchControllers.set(requestId, controller)
  try {
    return await search(controller.signal)
  } finally {
    if (searchControllers.get(requestId) === controller) {
      searchControllers.delete(requestId)
    }
  }
}

export const cancelXiaohongshuSearch = (requestId: string) => {
  const controller = searchControllers.get(requestId)
  if (!controller) return false

  controller.abort()
  searchControllers.delete(requestId)
  return true
}
