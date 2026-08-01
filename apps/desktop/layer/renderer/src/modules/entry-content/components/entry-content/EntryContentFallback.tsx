import { useHasEntry, usePrefetchEntryDetail } from "@follow/store/entry/hooks"
import { memo, Suspense } from "react"

import { EntryNotFound } from "~/components/errors/EntryNotFound"

import { shouldShowEntryNotFound } from "./entry-content-fallback-state"
import { EntryContentLoading } from "./EntryContentLoading"

interface EntryContentFallbackProps {
  entryId: string
  children: React.ReactNode
}

/**
 * Reusable fallback wrapper component that handles:
 * 1. Entry prefetching and 404 detection
 * 2. Suspense fallback with loading state
 * 3. Error boundary for entry not found cases
 */
export const EntryContentFallback = memo(({ entryId, children }: EntryContentFallbackProps) => {
  const hasLocalEntry = useHasEntry(entryId)
  const { data: realEntry, isPending: loadingRemoteEntry } = usePrefetchEntryDetail(entryId)

  if (
    shouldShowEntryNotFound({
      hasLocalEntry,
      loadingRemoteEntry,
      hasRemoteEntry: Boolean(realEntry),
    })
  ) {
    // 404
    throw new EntryNotFound()
  }

  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 flex flex-1 items-center justify-center">
          <EntryContentLoading />
        </div>
      }
    >
      {children}
    </Suspense>
  )
})

EntryContentFallback.displayName = "EntryContentFallback"
