import {
  createByokRequestPayload,
  getByokProviderModelSelectorValue,
  ZENMUX_OPENAI_BASE_URL,
} from "@follow/shared/settings/byok"
import { describe, expect, it } from "vitest"

describe("createByokRequestPayload", () => {
  it("returns null when BYOK is disabled", () => {
    expect(
      createByokRequestPayload({
        enabled: false,
        providers: [
          {
            provider: "zenmux",
            apiKey: "sk-test",
          },
        ],
      }),
    ).toBeNull()
  })

  it("filters providers without API keys", () => {
    expect(
      createByokRequestPayload({
        enabled: true,
        providers: [
          {
            provider: "zenmux",
            apiKey: " ",
          },
        ],
      }),
    ).toBeNull()
  })

  it("normalizes ZenMux with its OpenAI-compatible base URL", () => {
    expect(
      createByokRequestPayload({
        enabled: true,
        providers: [
          {
            provider: "zenmux",
            apiKey: " sk-zenmux ",
          },
        ],
      }),
    ).toEqual({
      enabled: true,
      providers: [
        {
          provider: "zenmux",
          apiKey: "sk-zenmux",
          baseURL: ZENMUX_OPENAI_BASE_URL,
          model: "zenmux/auto",
        },
      ],
    })
  })

  it("trims provider model and preserves extra body config", () => {
    expect(
      createByokRequestPayload({
        enabled: true,
        providers: [
          {
            provider: "zenmux",
            apiKey: " sk-zenmux ",
            model: " openai/gpt-5 ",
            extraBody: {
              model_routing_config: {
                preference: "balanced",
              },
            },
          },
        ],
      }),
    ).toEqual({
      enabled: true,
      providers: [
        {
          provider: "zenmux",
          apiKey: "sk-zenmux",
          baseURL: ZENMUX_OPENAI_BASE_URL,
          model: "openai/gpt-5",
          extraBody: {
            model_routing_config: {
              preference: "balanced",
            },
          },
        },
      ],
    })
  })

  it("creates provider-scoped model selector values for BYOK model menus", () => {
    expect(
      getByokProviderModelSelectorValue({
        provider: "openrouter",
        model: "openai/gpt-5-mini",
      }),
    ).toBe("openrouter/openai/gpt-5-mini")

    expect(
      getByokProviderModelSelectorValue({
        provider: "zenmux",
        model: "zenmux/auto",
      }),
    ).toBe("zenmux/zenmux/auto")
  })
})
