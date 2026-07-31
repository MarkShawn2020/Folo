import { FeedViewType } from "@follow/constants"
import { getEntry } from "@follow/store/entry/getter"
import { entryActions } from "@follow/store/entry/store"
import type { EntryModel } from "@follow/store/entry/types"
import { feedActions } from "@follow/store/feed/store"
import { subscriptionActions } from "@follow/store/subscription/store"
import type { SubscriptionModel } from "@follow/store/subscription/types"
import { unreadActions } from "@follow/store/unread/store"
import { whoami } from "@follow/store/user/getters"

export interface XiaohongshuProfileNote {
  index: number
  title: string
  author: string
  authorId: string
  authorAvatar: string
  cover: string
  url: string
  noteId: string | null
  xsecToken: string | null
}

export interface XiaohongshuUserProfile {
  userId: string
  redId: string
  nickname: string
  description: string
  avatar: string
  profileUrl: string
  notes: XiaohongshuProfileNote[]
}

export interface XiaohongshuLocalImportResult {
  feedId: string
  entryCount: number
  unreadCount: number
}

export const getXiaohongshuLocalFeedId = (userId: string) => `xiaohongshu-${userId}`

const getXiaohongshuLocalEntryId = (feedId: string, noteId: string) => `${feedId}-${noteId}`

export const getXiaohongshuNotePublishedAt = (noteId: string, index: number, now = new Date()) => {
  const timestamp = Number.parseInt(noteId.slice(0, 8), 16) * 1000
  const earliestTimestamp = Date.UTC(2010, 0, 1)
  const latestTimestamp = now.getTime() + 24 * 60 * 60 * 1000

  if (
    Number.isFinite(timestamp) &&
    timestamp >= earliestTimestamp &&
    timestamp <= latestTimestamp
  ) {
    return new Date(timestamp)
  }

  return new Date(now.getTime() - index * 1000)
}

export const importXiaohongshuProfileToLocalFeed = async (
  profile: XiaohongshuUserProfile,
): Promise<XiaohongshuLocalImportResult> => {
  const feedId = getXiaohongshuLocalFeedId(profile.userId)
  const now = new Date()
  const notes = profile.notes.filter((note): note is XiaohongshuProfileNote & { noteId: string } =>
    Boolean(note.noteId),
  )
  const latestNote = notes[0]
  const title = profile.nickname || latestNote?.author || profile.userId
  const avatar = profile.avatar || latestNote?.authorAvatar || null

  await feedActions.upsertMany([
    {
      id: feedId,
      title,
      url: `xiaohongshu://user/${encodeURIComponent(profile.userId)}`,
      description: profile.description || null,
      image: avatar,
      siteUrl: profile.profileUrl,
      ownerUserId: null,
      errorAt: null,
      errorMessage: null,
      subscriptionCount: null,
      updatesPerWeek: null,
      latestEntryPublishedAt: latestNote
        ? getXiaohongshuNotePublishedAt(latestNote.noteId, latestNote.index, now).toISOString()
        : null,
      tipUserIds: null,
      updatedAt: now,
    },
  ])

  const subscription: SubscriptionModel = {
    feedId,
    listId: null,
    inboxId: null,
    userId: whoami()?.id || "local",
    view: FeedViewType.Articles,
    isPrivate: true,
    hideFromTimeline: false,
    title,
    category: "小红书",
    createdAt: now.toISOString(),
    type: "feed",
  }

  await subscriptionActions.upsertMany([subscription])

  const entries: EntryModel[] = notes.map((note) => {
    const id = getXiaohongshuLocalEntryId(feedId, note.noteId)
    const existing = getEntry(id)

    return {
      id,
      title: note.title,
      url: note.url,
      content: existing?.content || null,
      readabilityContent: existing?.readabilityContent || null,
      readabilityUpdatedAt: existing?.readabilityUpdatedAt || null,
      description: existing?.description || null,
      guid: note.url || note.noteId,
      author: note.author || title,
      authorUrl: profile.profileUrl,
      authorAvatar: note.authorAvatar || avatar,
      insertedAt: existing?.insertedAt || now,
      publishedAt: getXiaohongshuNotePublishedAt(note.noteId, note.index, now),
      media: note.cover ? [{ url: note.cover, type: "photo" }] : null,
      categories: null,
      attachments: null,
      extra: {
        links: [
          {
            url: note.url,
            type: "text/html",
          },
        ],
      },
      language: "zh-CN",
      feedId,
      inboxHandle: null,
      read: existing?.read ?? false,
      sources: null,
      settings: null,
    }
  })

  await entryActions.upsertMany(entries)

  const unreadCount = Object.values(entryActions.getFlattenMapEntries()).filter(
    (entry) => entry.feedId === feedId && !entry.read,
  ).length
  await unreadActions.updateById(feedId, unreadCount)

  return {
    feedId,
    entryCount: entries.length,
    unreadCount,
  }
}
