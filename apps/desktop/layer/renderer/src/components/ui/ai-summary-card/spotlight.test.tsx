import { FollowAPIError } from "@follow-app/client-sdk"
import { Provider } from "jotai"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { jotaiStore } from "~/lib/jotai"

import { AISummaryCardBase } from "./AISummaryCardBase"

const { byokSettingsMock, markdownMock, paymentEnabledMock } = vi.hoisted(() => ({
  byokSettingsMock: {
    value: {
      enabled: false,
      providers: [] as { provider: "zenmux"; apiKey: string }[],
    },
  },
  markdownMock: vi.fn(() => null),
  paymentEnabledMock: {
    value: false,
  },
}))

vi.mock("~/atoms/server-configs", () => ({
  useIsPaymentEnabled: vi.fn(() => paymentEnabledMock.value),
}))

vi.mock("~/atoms/settings/ai", () => ({
  useAISettingKey: vi.fn(() => byokSettingsMock.value),
}))

vi.mock("~/atoms/settings/spotlight", () => ({
  useSpotlightSettingKey: vi.fn(() => [
    {
      id: "rule-1",
      enabled: true,
      pattern: "alpha",
      patternType: "keyword",
      caseSensitive: false,
      color: "#FDE68A",
    },
  ]),
}))

vi.mock("~/components/ui/markdown/Markdown", () => ({
  Markdown: markdownMock,
}))

vi.mock("~/hooks/biz/useFeature", () => ({
  useFeature: vi.fn(() => false),
}))

vi.mock("~/modules/settings/modal/useSettingModal", () => ({
  useSettingModal: vi.fn(() => vi.fn()),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: vi.fn(() => ({
      t: (key: string) => key,
    })),
  }
})

const renderSummary = async (element: React.ReactNode) => {
  const container = document.createElement("div")
  document.body.append(container)

  const root = createRoot(container)

  await act(async () => {
    root.render(<Provider store={jotaiStore}>{element}</Provider>)
  })

  return { container, root }
}

describe("AISummaryCardBase spotlight", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    container?.remove()
    root = null
    container = null
    byokSettingsMock.value = {
      enabled: false,
      providers: [],
    }
    paymentEnabledMock.value = false
    vi.clearAllMocks()
  })

  test("passes spotlight rules to the summary markdown renderer", async () => {
    ;({ container, root } = await renderSummary(<AISummaryCardBase content="alpha beta" />))

    expect(markdownMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spotlightRules: [
          expect.objectContaining({
            id: "rule-1",
            pattern: "alpha",
          }),
        ],
      }),
      undefined,
    )
  })

  test("shows the upgrade prompt for remote 402 summary errors", async () => {
    paymentEnabledMock.value = true
    ;({ container, root } = await renderSummary(
      <AISummaryCardBase error={new FollowAPIError("Payment required", 402)} />,
    ))

    expect(container.textContent).toContain("ai.summary_upgrade_required_title")
  })

  test("treats BYOK as Pro-equivalent for 402 summary errors", async () => {
    paymentEnabledMock.value = true
    byokSettingsMock.value = {
      enabled: true,
      providers: [
        {
          provider: "zenmux",
          apiKey: "sk-test",
        },
      ],
    }
    ;({ container, root } = await renderSummary(
      <AISummaryCardBase error={new FollowAPIError("Payment required", 402)} />,
    ))

    expect(container.textContent).not.toContain("ai.summary_upgrade_required_title")
    expect(container.textContent).toContain("ai.summary_not_available")
  })
})
