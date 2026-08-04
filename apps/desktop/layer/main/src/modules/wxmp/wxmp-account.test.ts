import { describe, expect, it } from "vitest"

import { isWxmpAccountSearchMatch, parseWxmpLoginAccount } from "./wxmp-account"

describe("wxmp account metadata", () => {
  it("extracts the logged-in account from WeChat home HTML", () => {
    const html = `
      <script>
        var real_nick_name = '手工川';
        var user_name = 'gh_example';
      </script>
    `

    expect(parseWxmpLoginAccount(html)).toMatchObject({
      nickname: "手工川",
      username: "gh_example",
    })
  })

  it("extracts account metadata from HTML-encoded state", () => {
    const html = `<script>window.wx = {&quot;nickname&quot;:&quot;手工川&quot;,&quot;alias&quot;:&quot;lovstudio&quot;}</script>`

    expect(parseWxmpLoginAccount(html)).toMatchObject({
      nickname: "手工川",
      alias: "lovstudio",
    })
  })

  it("strictly matches WeChat accounts before aggregation", () => {
    const account = {
      fakeid: "fake-id",
      nickname: "手工川工作室",
      alias: "LovStudio",
    }

    expect(isWxmpAccountSearchMatch(account, "手工川")).toBe(true)
    expect(isWxmpAccountSearchMatch(account, " LOV STUDIO ")).toBe(true)
    expect(isWxmpAccountSearchMatch(account, "AI Lynn")).toBe(false)
  })
})
