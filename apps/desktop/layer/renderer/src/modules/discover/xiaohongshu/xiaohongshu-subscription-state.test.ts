import { describe, expect, it } from "vitest"

import {
  addAccountTask,
  getAccountSubscriptionState,
  removeAccountTask,
} from "./xiaohongshu-subscription-state"

describe("Xiaohongshu account subscription state", () => {
  it("tracks concurrent account syncs independently", () => {
    let syncingUserIds = new Set<string>()
    syncingUserIds = addAccountTask(syncingUserIds, "user-a")

    expect(
      getAccountSubscriptionState({
        userId: "user-b",
        syncingUserIds,
        subscribedUserIds: new Set(),
      }).isDisabled,
    ).toBe(false)

    syncingUserIds = addAccountTask(syncingUserIds, "user-b")
    syncingUserIds = removeAccountTask(syncingUserIds, "user-a")

    expect(syncingUserIds.has("user-a")).toBe(false)
    expect(syncingUserIds.has("user-b")).toBe(true)
  })

  it("disables only the completed account", () => {
    const subscribedUserIds = new Set(["user-a"])
    const syncingUserIds = new Set<string>()

    expect(
      getAccountSubscriptionState({ userId: "user-a", syncingUserIds, subscribedUserIds }),
    ).toMatchObject({ isSubscribed: true, isDisabled: true })
    expect(
      getAccountSubscriptionState({ userId: "user-b", syncingUserIds, subscribedUserIds }),
    ).toMatchObject({ isSubscribed: false, isDisabled: false })
  })
})
