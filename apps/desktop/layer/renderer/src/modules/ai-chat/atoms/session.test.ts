import { describe, expect, it } from "vitest"

import { getNextAIModelState } from "./session"

describe("getNextAIModelState", () => {
  it("does not record automatic default model updates as recent usage", () => {
    expect(
      getNextAIModelState(
        {
          selectedModel: "zenmux/openai/gpt-5",
          recentModels: ["zenmux/openai/gpt-5"],
        },
        "zenmux/zenmux/auto",
      ),
    ).toEqual({
      selectedModel: "zenmux/zenmux/auto",
      recentModels: ["zenmux/openai/gpt-5"],
    })
  })

  it("records explicit model selections at the front without duplicates", () => {
    expect(
      getNextAIModelState(
        {
          selectedModel: "zenmux/openai/gpt-5",
          recentModels: ["zenmux/openai/gpt-5", "zenmux/x-ai/grok-4.3"],
        },
        "zenmux/x-ai/grok-4.3",
        { recordRecent: true },
      ),
    ).toEqual({
      selectedModel: "zenmux/x-ai/grok-4.3",
      recentModels: ["zenmux/x-ai/grok-4.3", "zenmux/openai/gpt-5"],
    })
  })

  it("keeps at most five recent models and ignores empty stored values", () => {
    expect(
      getNextAIModelState(
        {
          selectedModel: "model-1",
          recentModels: ["", "model-1", "model-2", "model-3", "model-4", "model-5"],
        },
        "model-6",
        { recordRecent: true },
      ),
    ).toEqual({
      selectedModel: "model-6",
      recentModels: ["model-6", "model-1", "model-2", "model-3", "model-4"],
    })
  })

  it("normalizes legacy state without recent models", () => {
    expect(getNextAIModelState({ selectedModel: "model-1" }, "model-2")).toEqual({
      selectedModel: "model-2",
      recentModels: [],
    })
  })
})
