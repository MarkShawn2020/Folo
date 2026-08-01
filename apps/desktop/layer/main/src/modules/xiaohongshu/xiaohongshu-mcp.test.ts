import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getXiaohongshuLoginStatus,
  parseXiaohongshuNoteContent,
  parseXiaohongshuSearchAccounts,
  parseXiaohongshuSearchResults,
  parseXiaohongshuUserProfile,
  searchXiaohongshuAccounts,
  searchXiaohongshuNotes,
} from "./xiaohongshu-mcp"

const ensureLocalXiaohongshuMCP = vi.fn<(endpoint: string) => Promise<void>>()

vi.mock("./xiaohongshu-service", () => ({
  ensureLocalXiaohongshuMCP,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  ensureLocalXiaohongshuMCP.mockReset()
})

describe("xiaohongshu-mcp parsers", () => {
  it("parses search result JSON from xpzouying/xiaohongshu-mcp", () => {
    const raw = JSON.stringify({
      feeds: [
        {
          xsecToken: "token-a",
          id: "abc123",
          modelType: "note",
          index: 0,
          noteCard: {
            type: "normal",
            displayTitle: "上海周末咖啡地图",
            user: {
              userId: "user-a",
              nickname: "小红",
              avatar: "https://sns-avatar-qc.xhscdn.com/avatar-a",
            },
            interactInfo: {
              likedCount: "1234",
              commentCount: "56",
              collectedCount: "789",
            },
            cover: {
              urlDefault: "https://sns-img-qc.xhscdn.com/cover-a",
            },
          },
        },
        {
          xsecToken: "token-b",
          id: "def456",
          modelType: "note",
          index: 1,
          noteCard: {
            type: "normal",
            displayTitle: "杭州徒步路线",
            user: {
              userId: "user-b",
              nickname: "小蓝",
            },
            interactInfo: {
              likedCount: "88",
              commentCount: "9",
              collectedCount: "12",
            },
            cover: {
              infoList: [{ url: "https://sns-img-qc.xhscdn.com/cover-b" }],
            },
          },
        },
      ],
      count: 2,
    })

    const result = parseXiaohongshuSearchResults(raw)

    expect(result).toMatchObject([
      {
        index: 0,
        title: "上海周末咖啡地图",
        author: "小红",
        authorId: "user-a",
        authorAvatar: "https://sns-avatar-qc.xhscdn.com/avatar-a",
        likedCount: "1234",
        commentCount: "56",
        collectedCount: "789",
        cover: "https://sns-img-qc.xhscdn.com/cover-a",
        noteId: "abc123",
        xsecToken: "token-a",
      },
      {
        index: 1,
        title: "杭州徒步路线",
        author: "小蓝",
        authorId: "user-b",
        authorAvatar: "",
        likedCount: "88",
        commentCount: "9",
        collectedCount: "12",
        cover: "https://sns-img-qc.xhscdn.com/cover-b",
        noteId: "def456",
        xsecToken: "token-b",
      },
    ])
    expect(result[0]?.url).toBe(
      "https://www.xiaohongshu.com/explore/abc123?xsec_token=token-a&xsec_source=pc_feed",
    )
  })

  it("deduplicates note authors into subscribable accounts and ranks exact matches first", () => {
    const raw = JSON.stringify({
      feeds: [
        {
          xsecToken: "token-a",
          id: "note-a",
          noteCard: {
            displayTitle: "上海探店",
            user: { userId: "user-a", nickname: "城市漫游" },
          },
        },
        {
          xsecToken: "token-b",
          id: "note-b",
          noteCard: {
            displayTitle: "城市漫游周末路线",
            user: { userId: "user-b", nickname: "阿蓝" },
          },
        },
        {
          xsecToken: "token-c",
          id: "note-c",
          noteCard: {
            displayTitle: "杭州散步",
            user: {
              userId: "user-a",
              nickname: "城市漫游",
              avatar: "https://example.com/avatar-a.png",
            },
          },
        },
      ],
    })

    expect(parseXiaohongshuSearchAccounts(raw, "城市漫游")).toEqual([
      {
        userId: "user-a",
        nickname: "城市漫游",
        avatar: "https://example.com/avatar-a.png",
        profileUrl: "https://www.xiaohongshu.com/user/profile/user-a",
        xsecToken: "token-a",
        matchedNoteCount: 2,
        sampleTitles: ["上海探店", "杭州散步"],
      },
      {
        userId: "user-b",
        nickname: "阿蓝",
        avatar: "",
        profileUrl: "https://www.xiaohongshu.com/user/profile/user-b",
        xsecToken: "token-b",
        matchedNoteCount: 1,
        sampleTitles: ["城市漫游周末路线"],
      },
    ])
  })

  it("filters fuzzy upstream accounts that do not contain the platform query", () => {
    const raw = JSON.stringify({
      feeds: [
        {
          xsecToken: "token-a",
          id: "note-a",
          noteCard: {
            displayTitle: "独立开发周记",
            user: { userId: "user-a", nickname: "手工川工作室" },
          },
        },
        {
          xsecToken: "token-b",
          id: "note-b",
          noteCard: {
            displayTitle: "商业访谈提问法 Skills",
            user: { userId: "user-b", nickname: "AI Lynn姐" },
          },
        },
      ],
    })

    expect(parseXiaohongshuSearchAccounts(raw, "手工川")).toEqual([
      expect.objectContaining({ userId: "user-a", nickname: "手工川工作室" }),
    ])
    expect(parseXiaohongshuSearchAccounts(raw, "手工穿")).toEqual([])
  })

  it("normalizes casing and whitespace without enabling fuzzy platform matches", () => {
    const raw = JSON.stringify({
      feeds: [
        {
          xsecToken: "token-a",
          id: "note-a",
          noteCard: {
            displayTitle: "AI 产品观察",
            user: { userId: "user-a", nickname: "AI Lynn 姐" },
          },
        },
      ],
    })

    expect(parseXiaohongshuSearchAccounts(raw, " ai lynn ")).toHaveLength(1)
    expect(parseXiaohongshuSearchAccounts(raw, "AI Lin")).toEqual([])
  })

  it("parses a user profile with its account metadata and notes", () => {
    const raw = JSON.stringify({
      userBasicInfo: {
        redId: "red-123",
        nickname: "城市漫游",
        desc: "周末散步记录",
        imageb: "https://example.com/avatar.png",
      },
      feeds: [
        {
          id: "6a69796d0000000010026968",
          xsecToken: "note-token",
          noteCard: {
            displayTitle: "上海散步",
            user: { userId: "user-a", nickname: "城市漫游" },
          },
        },
      ],
    })

    expect(parseXiaohongshuUserProfile(raw, "user-a")).toMatchObject({
      userId: "user-a",
      redId: "red-123",
      nickname: "城市漫游",
      description: "周末散步记录",
      avatar: "https://example.com/avatar.png",
      profileUrl: "https://www.xiaohongshu.com/user/profile/user-a",
      notes: [
        {
          noteId: "6a69796d0000000010026968",
          title: "上海散步",
          xsecToken: "note-token",
        },
      ],
    })
  })

  it("parses feed detail JSON from xpzouying/xiaohongshu-mcp", () => {
    const raw = JSON.stringify({
      feed_id: "abc123",
      data: {
        note: {
          noteId: "abc123",
          xsecToken: "token-a",
          title: "上海周末咖啡地图",
          desc: "第一段\n第二段",
          time: 1_714_550_400_000,
          user: {
            userId: "user-a",
            nickname: "小红",
          },
          interactInfo: {
            likedCount: "1234",
            commentCount: "56",
            collectedCount: "789",
          },
          imageList: [
            {
              urlDefault: "https://sns-img-qc.xhscdn.com/detail-a",
            },
          ],
        },
        comments: {
          list: [],
          hasMore: false,
        },
      },
    })

    expect(parseXiaohongshuNoteContent(raw)).toEqual({
      title: "上海周末咖啡地图",
      author: "小红",
      publishedAt: "2024-05-01T08:00:00.000Z",
      likedCount: "1234",
      commentCount: "56",
      collectedCount: "789",
      url: "https://www.xiaohongshu.com/explore/abc123?xsec_token=token-a&xsec_source=pc_feed",
      content: "第一段\n第二段",
      cover: "https://sns-img-qc.xhscdn.com/detail-a",
      raw,
    })
  })
})

describe("xiaohongshu-mcp connection", () => {
  it("starts the managed local service and retries after a connection failure", async () => {
    ensureLocalXiaohongshuMCP.mockResolvedValue()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          headers: { "mcp-session-id": "session-a" },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    feeds: [
                      {
                        id: "abc123",
                        xsecToken: "token-a",
                        noteCard: { displayTitle: "上海咖啡店" },
                      },
                    ],
                  }),
                },
              ],
            },
          }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchXiaohongshuNotes("上海咖啡店")

    expect(ensureLocalXiaohongshuMCP).toHaveBeenCalledWith("http://localhost:18060/mcp")
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]?.title).toBe("上海咖啡店")
  })

  it("returns account results instead of exposing matching notes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          headers: { "mcp-session-id": "session-a" },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    feeds: [
                      {
                        id: "note-a",
                        xsecToken: "token-a",
                        noteCard: {
                          displayTitle: "上海咖啡店",
                          user: { userId: "user-a", nickname: "小红" },
                        },
                      },
                    ],
                  }),
                },
              ],
            },
          }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(searchXiaohongshuAccounts("小红")).resolves.toEqual({
      accounts: [
        {
          userId: "user-a",
          nickname: "小红",
          avatar: "",
          profileUrl: "https://www.xiaohongshu.com/user/profile/user-a",
          xsecToken: "token-a",
          matchedNoteCount: 1,
          sampleTitles: ["上海咖啡店"],
        },
      ],
    })
  })

  it("aborts an active account search when the caller cancels it", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      const signal = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        if (!signal) {
          reject(new Error("Missing abort signal"))
          return
        }
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        )
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const searchPromise = searchXiaohongshuAccounts("小红", { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    controller.abort()

    await expect(searchPromise).rejects.toThrow("request was cancelled")
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it("starts the managed service before reading login status", async () => {
    ensureLocalXiaohongshuMCP.mockResolvedValue()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { is_logged_in: true, username: "手工川", user_id: "user-a" },
          }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(getXiaohongshuLoginStatus()).resolves.toEqual({
      isLoggedIn: true,
      username: "手工川",
      userId: "user-a",
    })
    expect(ensureLocalXiaohongshuMCP).toHaveBeenCalledWith("http://localhost:18060/mcp")
  })

  it("does not manage a custom MCP endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")))

    await expect(
      searchXiaohongshuNotes("咖啡", { endpoint: "http://example.test/mcp" }),
    ).rejects.toThrow("fetch failed")
    expect(ensureLocalXiaohongshuMCP).not.toHaveBeenCalled()
  })
})
