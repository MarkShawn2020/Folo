import { isFreeRole } from "@follow/constants"
import { useEntry, usePrefetchEntryDetail } from "@follow/store/entry/hooks"
import { entryActions } from "@follow/store/entry/store"
import { useEntryTranslation, usePrefetchEntryTranslation } from "@follow/store/translation/hooks"
import { useUserRole } from "@follow/store/user/hooks"
import { tracker } from "@follow/tracker"
import { useQuery } from "@tanstack/react-query"
import { createElement, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useShowAITranslation } from "~/atoms/ai-translation"
import { useEntryIsInReadability, useEntryIsInReadabilitySuccess } from "~/atoms/readability"
import { useActionLanguage, useGeneralSettingKey } from "~/atoms/settings/general"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { ipcServices } from "~/lib/client"
import { loadXiaohongshuEntryContent } from "~/modules/discover/xiaohongshu/xiaohongshu-entry-content"
import { isXiaohongshuLocalFeedId } from "~/modules/discover/xiaohongshu/xiaohongshu-local-import"

import { ImageGalleryContent } from "./components/ImageGalleryContent"

export const useGalleryModal = () => {
  const { present } = useModalStack()
  const { t } = useTranslation()
  return useCallback(
    (entryId?: string) => {
      if (!entryId) {
        // this should not happen unless there is a bug in the code
        toast.error("Invalid feed id")
        return
      }
      tracker.entryContentHeaderImageGalleryClick({
        feedId: entryId,
      })
      present({
        title: t("entry_actions.image_gallery"),
        content: () => createElement(ImageGalleryContent, { entryId }),
        max: true,
        clickOutsideToDismiss: true,
      })
    },
    [present, t],
  )
}

export const useEntryContent = (entryId: string) => {
  const entry = useEntry(entryId, (state) => {
    const { inboxHandle, content, readabilityContent, feedId, url } = state
    return { inboxId: inboxHandle, content, readabilityContent, feedId, url }
  })
  const remoteEntryQuery = usePrefetchEntryDetail(entryId)
  const isLocalXiaohongshuEntry = isXiaohongshuLocalFeedId(entry?.feedId)
  const integrationServices = ipcServices?.integration
  const shouldLoadLocalContent = Boolean(
    isLocalXiaohongshuEntry && !entry?.content && entry?.url && integrationServices,
  )
  const localEntryQuery = useQuery({
    queryKey: ["xiaohongshu-entry-content", entryId, entry?.url],
    queryFn: async () => {
      if (!entry?.url || !integrationServices) return ""
      const content = await loadXiaohongshuEntryContent({
        url: entry.url,
        fetchDetail: (input) => integrationServices.fetchXiaohongshuNote(input),
      })
      if (content) {
        await entryActions.updateEntryContent({ entryId, content })
      }
      return content
    },
    enabled: shouldLoadLocalContent,
    staleTime: Infinity,
  })

  const isInReadabilityMode = useEntryIsInReadability(entryId)
  const isReadabilitySuccess = useEntryIsInReadabilitySuccess(entryId)

  const enableTranslation = useShowAITranslation()
  const userRole = useUserRole()
  const shouldPrefetchTranslation = enableTranslation && !isFreeRole(userRole)
  const actionLanguage = useActionLanguage()
  const translationMode = useGeneralSettingKey("translationMode")
  const contentTranslated = useEntryTranslation({
    entryId,
    language: actionLanguage,
    enabled: enableTranslation,
  })
  usePrefetchEntryTranslation({
    entryIds: [entryId],
    enabled: shouldPrefetchTranslation,
    language: actionLanguage,
    withContent: true,
    target: isReadabilitySuccess ? "readabilityContent" : "content",
    mode: translationMode,
  })

  return useMemo(() => {
    const entryContent = isInReadabilityMode
      ? entry?.readabilityContent
      : (entry?.content ??
        (isLocalXiaohongshuEntry ? localEntryQuery.data : remoteEntryQuery.data?.content))
    const translatedContent = isInReadabilityMode
      ? contentTranslated?.readabilityContent
      : contentTranslated?.content
    const content = translatedContent || entryContent
    return {
      content,
      error: isLocalXiaohongshuEntry ? localEntryQuery.error : remoteEntryQuery.error,
      isPending: isLocalXiaohongshuEntry
        ? shouldLoadLocalContent && localEntryQuery.isPending
        : remoteEntryQuery.isPending,
    }
  }, [
    contentTranslated?.content,
    contentTranslated?.readabilityContent,
    isLocalXiaohongshuEntry,
    localEntryQuery.data,
    localEntryQuery.error,
    localEntryQuery.isPending,
    remoteEntryQuery.data?.content,
    remoteEntryQuery.error,
    remoteEntryQuery.isPending,
    shouldLoadLocalContent,
    entry?.content,
    isInReadabilityMode,
    entry?.readabilityContent,
  ])
}

export const useEntryMediaInfo = (entryId: string) => {
  return useEntry(entryId, (entry) =>
    Object.fromEntries(
      entry?.media
        ?.filter((m) => m.type === "photo")
        .map((cur) => [
          cur.url,
          {
            width: cur.width,
            height: cur.height,
          },
        ]) ?? [],
    ),
  )
}
