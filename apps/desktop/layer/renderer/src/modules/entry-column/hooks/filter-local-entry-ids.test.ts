import { describe, expect, it } from "vitest"

import { getVisibleLocalEntryIds, shouldFetchRemoteEntries } from "./filter-local-entry-ids"

describe("shouldFetchRemoteEntries", () => {
  it("uses the local timeline for a Xiaohongshu subscription", () => {
    expect(
      shouldFetchRemoteEntries({
        feedId: "xiaohongshu-5975d7b55e87e7646c8e9cf5",
        folderFeedIds: [],
        isCollection: false,
      }),
    ).toBe(false)
  })

  it("uses the local timeline for a category containing only local subscriptions", () => {
    expect(
      shouldFetchRemoteEntries({
        feedId: "folder-小红书",
        folderFeedIds: ["xiaohongshu-5975d7b55e87e7646c8e9cf5"],
        isCollection: false,
      }),
    ).toBe(false)
  })

  it("keeps server-backed subscriptions on the remote timeline", () => {
    expect(
      shouldFetchRemoteEntries({
        feedId: "41358761177015296",
        folderFeedIds: [],
        isCollection: false,
      }),
    ).toBe(true)
  })

  it("keeps aggregate routes on the remote timeline", () => {
    expect(
      shouldFetchRemoteEntries({
        feedId: "all",
        folderFeedIds: [],
        isCollection: false,
      }),
    ).toBe(true)
  })
})

describe("getVisibleLocalEntryIds", () => {
  it("keeps previously visible unread entries when they turn read locally", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-1", "entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: false },
        },
        stickyVisibleIds: new Set(["entry-1", "entry-2"]),
        unreadOnly: true,
      }),
    ).toEqual(["entry-1", "entry-2"])
  })

  it("filters read entries that were not previously visible", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-1", "entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: false },
        },
        stickyVisibleIds: new Set<string>(),
        unreadOnly: true,
      }),
    ).toEqual(["entry-2"])
  })

  it("removes sticky entries once they leave the source list", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: false },
        },
        stickyVisibleIds: new Set(["entry-1", "entry-2"]),
        unreadOnly: true,
      }),
    ).toEqual(["entry-2"])
  })
})
