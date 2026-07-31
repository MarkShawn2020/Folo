import { FeedViewType } from "@follow/constants"
import { getEntry } from "@follow/store/entry/getter"
import { entryActions } from "@follow/store/entry/store"
import type { EntryModel } from "@follow/store/entry/types"
import { feedActions } from "@follow/store/feed/store"
import { subscriptionActions } from "@follow/store/subscription/store"
import type { SubscriptionModel } from "@follow/store/subscription/types"
import { unreadActions } from "@follow/store/unread/store"
import { whoami } from "@follow/store/user/getters"
import type { DiscoveryItem } from "@follow-app/client-sdk"

const LOGIN_SITE_URL = "https://mp.weixin.qq.com/"

interface WxmpAccount {
  fakeid: string
  nickname: string
  alias: string | null
  signature: string | null
  avatar: string | null
  articleCount: number
}

interface WxmpArticle {
  aid: string
  fakeid: string
  title: string
  link: string
  digest: string | null
  cover: string | null
  author: string | null
  createTime: number
  contentHtml: string | null
  contentMd: string | null
}

export interface WxmpFetchResult {
  account: WxmpAccount
  articles: WxmpArticle[]
  stdout: string
  stderr: string
}

export interface WxmpLocalImportResult {
  feedId: string
  entryCount: number
  unreadCount: number
}

const encodeLocalIdPart = (value: string) =>
  value.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ".")

export const getWxmpLocalFeedId = (fakeid: string) => `wxmp-${encodeLocalIdPart(fakeid)}`

const getWxmpLocalEntryId = (article: WxmpArticle) =>
  `${getWxmpLocalFeedId(article.fakeid)}-${article.aid}`

export const importWxmpChannelToLocalFeed = async (
  result: WxmpFetchResult,
): Promise<WxmpLocalImportResult> => {
  const { account, articles } = result
  const feedId = getWxmpLocalFeedId(account.fakeid)
  const now = new Date()
  const latestArticle = articles[0]

  await feedActions.upsertMany([
    {
      id: feedId,
      title: account.nickname,
      url: `wxmp://${encodeURIComponent(account.fakeid)}`,
      description: account.signature,
      image: account.avatar,
      siteUrl: LOGIN_SITE_URL,
      ownerUserId: null,
      errorAt: null,
      errorMessage: null,
      subscriptionCount: null,
      updatesPerWeek: null,
      latestEntryPublishedAt: latestArticle
        ? new Date(latestArticle.createTime * 1000).toISOString()
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
    title: account.nickname,
    category: "WeChat",
    createdAt: now.toISOString(),
    type: "feed",
  }

  await subscriptionActions.upsertMany([subscription])

  const entries: EntryModel[] = articles.map((article) => {
    const id = getWxmpLocalEntryId(article)
    const existing = getEntry(id)
    const content = article.contentHtml || article.contentMd || existing?.content || article.digest
    const publishedAt = new Date(article.createTime * 1000)

    return {
      id,
      title: article.title,
      url: article.link,
      content,
      readabilityContent: null,
      readabilityUpdatedAt: null,
      description: article.digest,
      guid: article.link || article.aid,
      author: article.author || account.nickname,
      authorUrl: null,
      authorAvatar: account.avatar,
      insertedAt: existing?.insertedAt || now,
      publishedAt,
      media: article.cover ? [{ url: article.cover, type: "photo" }] : null,
      categories: null,
      attachments: null,
      extra: {
        links: [
          {
            url: article.link,
            type: "text/html",
            content_html: article.contentHtml || undefined,
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

export const createWxmpDiscoveryItem = (
  result: WxmpFetchResult,
  imported: WxmpLocalImportResult,
): DiscoveryItem => {
  const { account, articles } = result
  const latestArticle = articles[0]

  return {
    feed: {
      type: "feed",
      id: imported.feedId,
      title: account.nickname,
      url: `wxmp://${encodeURIComponent(account.fakeid)}`,
      description: account.signature,
      siteUrl: LOGIN_SITE_URL,
      image: account.avatar,
    },
    entries: articles.slice(0, 4).map((article) => ({
      id: getWxmpLocalEntryId(article),
      title: article.title,
      content: article.contentHtml || article.contentMd,
      description: article.digest,
      publishedAt: new Date(article.createTime * 1000).toISOString(),
      url: article.link,
      author: article.author || account.nickname,
      feedId: imported.feedId,
      media: article.cover ? [{ url: article.cover, type: "photo" }] : null,
      authorUrl: null,
      authorAvatar: account.avatar,
      insertedAt: new Date().toISOString(),
      categories: [],
      attachments: [],
      extra: undefined,
      language: "zh-CN",
    })),
    analytics: {
      feedId: imported.feedId,
      view: FeedViewType.Articles,
      subscriptionCount: 0,
      updatesPerWeek: null,
      latestEntryPublishedAt: latestArticle
        ? new Date(latestArticle.createTime * 1000).toISOString()
        : null,
    } as DiscoveryItem["analytics"],
    subscriptionCount: 0,
  }
}
