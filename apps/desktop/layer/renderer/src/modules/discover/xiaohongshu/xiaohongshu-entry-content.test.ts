import { describe, expect, it, vi } from "vitest"

import {
  formatXiaohongshuEntryContent,
  loadXiaohongshuEntryContent,
} from "./xiaohongshu-entry-content"

describe("Xiaohongshu local entry content", () => {
  it("loads a note detail when a local entry is opened", async () => {
    const fetchDetail = vi.fn().mockResolvedValue({
      title: "上海周末",
      content: "第一段\n第二行\n\n第二段",
      cover: "https://example.com/cover.png",
    })

    await expect(
      loadXiaohongshuEntryContent({
        url: "https://www.xiaohongshu.com/explore/note-a?xsec_token=token-a",
        fetchDetail,
      }),
    ).resolves.toBe(
      '<figure><img src="https://example.com/cover.png" alt="" /></figure><p>第一段<br />第二行</p><p>第二段</p>',
    )
    expect(fetchDetail).toHaveBeenCalledOnce()
  })

  it("escapes note text and falls back to the title for notes without a description", () => {
    expect(formatXiaohongshuEntryContent("", "<新品> & 记录")).toBe(
      "<p>&lt;新品&gt; &amp; 记录</p>",
    )
  })
})
