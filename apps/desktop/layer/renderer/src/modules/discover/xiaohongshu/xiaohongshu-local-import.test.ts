import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  getXiaohongshuLocalFeedId,
  getXiaohongshuNotePublishedAt,
  getXiaohongshuSocialMediaSubscriptionUpdates,
  importXiaohongshuProfileToLocalFeed,
  isXiaohongshuLocalFeedId,
  repairXiaohongshuSubscriptionViews,
} from "./xiaohongshu-local-import"

const mocks = vi.hoisted(() => ({
  getEntry: vi.fn(),
  upsertEntries: vi.fn(),
  moveEntryViews: vi.fn(),
  getFlattenMapEntries: vi.fn(),
  upsertFeeds: vi.fn(),
  upsertSubscriptions: vi.fn(),
  getSubscriptions: vi.fn(),
  updateUnread: vi.fn(),
}))

vi.mock("@follow/store/entry/getter", () => ({ getEntry: mocks.getEntry }))
vi.mock("@follow/store/entry/store", () => ({
  entryActions: {
    upsertMany: mocks.upsertEntries,
    moveLocalFeedEntriesToView: mocks.moveEntryViews,
    getFlattenMapEntries: mocks.getFlattenMapEntries,
  },
}))
vi.mock("@follow/store/feed/store", () => ({
  feedActions: { upsertMany: mocks.upsertFeeds },
}))
vi.mock("@follow/store/subscription/store", () => ({
  subscriptionActions: { upsertMany: mocks.upsertSubscriptions },
  useSubscriptionStore: {
    getState: () => ({ data: mocks.getSubscriptions() }),
  },
}))
vi.mock("@follow/store/unread/store", () => ({
  unreadActions: { updateById: mocks.updateUnread },
}))
vi.mock("@follow/store/user/getters", () => ({ whoami: () => ({ id: "user-local" }) }))

describe("xiaohongshu local feed helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getFlattenMapEntries.mockReturnValue({})
    mocks.getSubscriptions.mockReturnValue({})
  })

  it("creates a stable local feed id for an account", () => {
    expect(getXiaohongshuLocalFeedId("5975d7b55e87e7646c8e9cf5")).toBe(
      "xiaohongshu-5975d7b55e87e7646c8e9cf5",
    )
    expect(isXiaohongshuLocalFeedId("xiaohongshu-5975d7b55e87e7646c8e9cf5")).toBe(true)
    expect(isXiaohongshuLocalFeedId("41358761177015296")).toBe(false)
  })

  it("derives a note publish time from the timestamp prefix", () => {
    expect(
      getXiaohongshuNotePublishedAt(
        "6a69796d0000000010026968",
        0,
        new Date("2026-08-01T00:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-07-29T03:54:21.000Z")
  })

  it("falls back to profile order for an invalid note id", () => {
    expect(
      getXiaohongshuNotePublishedAt("invalid", 3, new Date("2026-08-01T00:00:00.000Z")),
    ).toEqual(new Date("2026-07-31T23:59:57.000Z"))
  })

  it("creates a local subscription without querying an RSSHub feed", async () => {
    mocks.getFlattenMapEntries.mockReturnValue({
      "xiaohongshu-user-a-note-a": {
        feedId: "xiaohongshu-user-a",
        read: false,
      },
    })

    const result = await importXiaohongshuProfileToLocalFeed({
      userId: "user-a",
      redId: "red-a",
      nickname: "城市漫游",
      description: "周末散步记录",
      avatar: "https://example.com/avatar.png",
      profileUrl: "https://www.xiaohongshu.com/user/profile/user-a",
      notes: [
        {
          index: 0,
          title: "上海散步",
          author: "城市漫游",
          authorId: "user-a",
          authorAvatar: "https://example.com/avatar.png",
          cover: "https://example.com/cover.png",
          url: "https://www.xiaohongshu.com/explore/note-a",
          noteId: "note-a",
          xsecToken: "token-a",
        },
      ],
    })

    expect(mocks.upsertFeeds).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "xiaohongshu-user-a",
        title: "城市漫游",
        url: "xiaohongshu://user/user-a",
      }),
    ])
    expect(mocks.upsertSubscriptions).toHaveBeenCalledWith([
      expect.objectContaining({
        feedId: "xiaohongshu-user-a",
        userId: "user-local",
        category: "小红书",
        view: FeedViewType.SocialMedia,
      }),
    ])
    expect(mocks.upsertEntries).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "xiaohongshu-user-a-note-a",
        feedId: "xiaohongshu-user-a",
        title: "上海散步",
      }),
    ])
    expect(mocks.updateUnread).toHaveBeenCalledWith("xiaohongshu-user-a", 1)
    expect(mocks.moveEntryViews).toHaveBeenCalledWith({
      feedIds: ["xiaohongshu-user-a"],
      view: FeedViewType.SocialMedia,
    })
    expect(result).toEqual({
      feedId: "xiaohongshu-user-a",
      entryCount: 1,
      unreadCount: 1,
    })
  })

  it("moves existing Xiaohongshu subscriptions into the social media view", async () => {
    const xiaohongshuSubscription = {
      feedId: "xiaohongshu-user-a",
      listId: null,
      inboxId: null,
      userId: "user-local",
      view: FeedViewType.Articles,
      isPrivate: true,
      hideFromTimeline: false,
      title: "城市漫游",
      category: "小红书",
      createdAt: "2026-08-01T00:00:00.000Z",
      type: "feed" as const,
    }
    const articleSubscription = {
      ...xiaohongshuSubscription,
      feedId: "regular-feed",
      category: "文章",
    }

    expect(
      getXiaohongshuSocialMediaSubscriptionUpdates([xiaohongshuSubscription, articleSubscription]),
    ).toEqual([
      {
        ...xiaohongshuSubscription,
        view: FeedViewType.SocialMedia,
      },
    ])

    mocks.getSubscriptions.mockReturnValue({
      "xiaohongshu-user-a": xiaohongshuSubscription,
      "regular-feed": articleSubscription,
    })

    await expect(repairXiaohongshuSubscriptionViews()).resolves.toBe(1)
    expect(mocks.upsertSubscriptions).toHaveBeenCalledWith([
      {
        ...xiaohongshuSubscription,
        view: FeedViewType.SocialMedia,
      },
    ])
    expect(mocks.moveEntryViews).toHaveBeenCalledWith({
      feedIds: ["xiaohongshu-user-a"],
      view: FeedViewType.SocialMedia,
    })
  })
})
