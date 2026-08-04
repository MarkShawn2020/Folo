import { FeedViewType } from "@follow/constants"
import { subscriptionActions, useSubscriptionStore } from "@follow/store/subscription/store"
import type { SubscriptionModel } from "@follow/store/subscription/types"
import { beforeEach, describe, expect, it } from "vitest"

const createViewSets = () => ({
  [FeedViewType.All]: new Set<string>(),
  [FeedViewType.Articles]: new Set<string>(),
  [FeedViewType.Audios]: new Set<string>(),
  [FeedViewType.Notifications]: new Set<string>(),
  [FeedViewType.Pictures]: new Set<string>(),
  [FeedViewType.SocialMedia]: new Set<string>(),
  [FeedViewType.Videos]: new Set<string>(),
})

describe("Xiaohongshu subscription view migration", () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      data: {},
      feedIdByView: createViewSets(),
      listIdByView: createViewSets(),
      categories: createViewSets(),
      subscriptionIdSet: new Set(),
      categoryOpenStateByView: {
        [FeedViewType.All]: {},
        [FeedViewType.Articles]: {},
        [FeedViewType.Audios]: {},
        [FeedViewType.Notifications]: {},
        [FeedViewType.Pictures]: {},
        [FeedViewType.SocialMedia]: {},
        [FeedViewType.Videos]: {},
      },
    })
  })

  it("removes stale article indexes when a local subscription moves to social media", async () => {
    const articleSubscription: SubscriptionModel = {
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
      type: "feed",
    }

    await subscriptionActions.upsertManyInSession([articleSubscription])
    await subscriptionActions.upsertManyInSession([
      { ...articleSubscription, view: FeedViewType.SocialMedia },
    ])

    const state = useSubscriptionStore.getState()
    expect(state.feedIdByView[FeedViewType.Articles]).not.toContain("xiaohongshu-user-a")
    expect(state.categories[FeedViewType.Articles]).not.toContain("小红书")
    expect(state.feedIdByView[FeedViewType.SocialMedia]).toContain("xiaohongshu-user-a")
    expect(state.categories[FeedViewType.SocialMedia]).toContain("小红书")
  })
})
