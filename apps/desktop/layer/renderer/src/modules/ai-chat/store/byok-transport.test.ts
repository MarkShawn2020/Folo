import { ZENMUX_OPENAI_BASE_URL } from "@follow/shared/settings/byok"
import { afterEach, describe, expect, it, vi } from "vitest"

import { streamByokChatCompletion } from "./byok-transport"

const createSSEStream = (chunks: string[]) => {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe("streamByokChatCompletion", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("streams OpenAI-compatible deltas and returns the final text", async () => {
    const requestInits: RequestInit[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) {
        requestInits.push(init)
      }

      return new Response(
        createSSEStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const updates: string[] = []
    const result = await streamByokChatCompletion({
      provider: {
        provider: "zenmux",
        apiKey: "sk-test",
        baseURL: ZENMUX_OPENAI_BASE_URL,
      },
      model: "zenmux/auto",
      messages: [
        {
          role: "user",
          content: "Summarize this.",
        },
      ],
      onDelta: (_delta, content) => updates.push(content),
    })

    expect(result).toBe("Hello world")
    expect(updates).toEqual(["Hello", "Hello world"])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(String(requestInits[0]?.body))).toMatchObject({
      stream: true,
      model: "zenmux/auto",
    })
  })
})
