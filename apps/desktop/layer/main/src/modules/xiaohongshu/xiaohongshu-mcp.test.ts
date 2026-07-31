import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getXiaohongshuLoginStatus,
  parseXiaohongshuNoteContent,
  parseXiaohongshuSearchResults,
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
