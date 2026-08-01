import { useMobile } from "@follow/components/hooks/useMobile.js"
import { Button, MotionButtonBase } from "@follow/components/ui/button/index.js"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@follow/components/ui/form/index.jsx"
import { Input } from "@follow/components/ui/input/index.js"
import { SegmentGroup, SegmentItem } from "@follow/components/ui/segment/index.js"
import { ResponsiveSelect } from "@follow/components/ui/select/responsive.js"
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@follow/components/ui/tooltip/index.js"
import { cn } from "@follow/utils/utils"
import type { DiscoveryItem } from "@follow-app/client-sdk"
import { zodResolver } from "@hookform/resolvers/zod"
import { repository } from "@pkg"
import { useMutation } from "@tanstack/react-query"
import { produce } from "immer"
import type { ChangeEvent, CompositionEvent } from "react"
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { z } from "zod"

import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { useRequireLogin } from "~/hooks/common/useRequireLogin"
import { followClient } from "~/lib/api-client"
import { ipcServices } from "~/lib/client"
import { toastFetchError } from "~/lib/error-parser"

import {
  getDiscoverSearchData,
  setDiscoverSearchData,
  setXiaohongshuDiscoverSearchData,
  useDiscoverSearchData,
  useXiaohongshuDiscoverSearchData,
} from "./atoms/discover"
import { DiscoverChannelsPanel } from "./DiscoverChannelsPanel"
import { DiscoverFeedCard } from "./DiscoverFeedCard"
import { DiscoverImport } from "./DiscoverImport"
import { DiscoverInboxList } from "./DiscoverInboxList"
import { DiscoverTransform } from "./DiscoverTransform"
import { DiscoverUser } from "./DiscoverUser"
import { FeedForm } from "./FeedForm"
import { WechatChannelForm } from "./WechatChannelForm"
import type { XiaohongshuSearchAccount } from "./xiaohongshu/types"
import { getCachedXiaohongshuLogin } from "./xiaohongshu/xiaohongshu-login-cache"
import { XiaohongshuAccountCard } from "./xiaohongshu/XiaohongshuAccountCard"

const isFeedLikeUrl = (value: string) => {
  const trimmed = value.trim()
  return /^(?:https?:\/\/|rsshub:\/\/|folo:\/\/|follow:\/\/)/.test(trimmed)
}

// Auto-detect input type
function detectInputType(value: string): "rss" | "rsshub" | "search" {
  const trimmed = value.trim()
  if (trimmed.startsWith("rsshub://")) {
    return "rsshub"
  }
  if (isFeedLikeUrl(trimmed) && !trimmed.startsWith("rsshub://")) {
    return "rss"
  }
  return "search"
}

const searchTargets = ["feeds", "lists"] as const
type SearchTarget = (typeof searchTargets)[number]
const supportedChannelCount = 3

const searchSchema = z.object({
  keyword: z.string().min(1),
  target: z.enum(searchTargets),
})

const rssSchema = z.object({
  keyword: z.string().refine(isFeedLikeUrl, {
    message: "Invalid RSS URL",
  }),
})

const rsshubSchema = z.object({
  keyword: z.string().url().startsWith("rsshub://"),
})

type SearchFormData = z.infer<typeof searchSchema>

interface WxmpSearchAccount {
  fakeid: string
  nickname: string
  alias: string | null
  signature: string | null
  avatar: string | null
}

const searchWxmpAccounts = async (keyword: string): Promise<WxmpSearchAccount[]> => {
  if (!window.electron?.ipcRenderer || !ipcServices?.wxmp) {
    return []
  }

  try {
    return await ipcServices.wxmp.searchAccounts({ query: keyword })
  } catch {
    return []
  }
}

const fetchXiaohongshuAccounts = async (keyword: string): Promise<XiaohongshuSearchAccount[]> => {
  const integrationServices = ipcServices?.integration
  if (!window.electron?.ipcRenderer || !integrationServices) {
    return []
  }

  try {
    const cachedLogin = getCachedXiaohongshuLogin({})
    const hasCredential =
      Boolean(cachedLogin) || (await integrationServices.hasCachedXiaohongshuSession({}))
    if (!hasCredential) {
      return []
    }

    const result = await integrationServices.searchXiaohongshuAccounts({ keywords: keyword })
    return result.accounts
  } catch {
    // An optional local channel must not block results from the primary Folo search.
    return []
  }
}

// Compact Tool Link Component
interface ToolLinkProps {
  icon: string
  label: string
  onClick: () => void
}

function ToolLink({ icon, label, onClick }: ToolLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
        "text-text-secondary hover:bg-fill-secondary hover:text-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
      )}
    >
      <i className={cn(icon, "size-3.5 shrink-0")} />
      <span>{label}</span>
    </button>
  )
}

export function UnifiedDiscoverForm() {
  const [searchParams, setSearchParams] = useSearchParams()
  const keywordFromSearch = searchParams.get("keyword") || ""
  const { t } = useTranslation()
  const { ensureLogin } = useRequireLogin()
  const { present, dismissAll } = useModalStack()
  const isMobile = useMobile()

  // Auto-detect input type based on current value
  const detectedType = useMemo(() => {
    if (keywordFromSearch) {
      return detectInputType(keywordFromSearch)
    }
    return "search"
  }, [keywordFromSearch])

  // Use search form by default, but validate based on detected type
  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      keyword: keywordFromSearch || "",
      target: "feeds",
    },
    // Channel settings is adjacent to the input. Blurring an empty input to open it
    // must not surface a search validation error.
    mode: "onChange",
  })

  const { watch, trigger } = form
  const target = watch("target")
  const atomKey = useRef(keywordFromSearch + target)
  const isComposingRef = useRef(false)
  const [wxmpSearchData, setWxmpSearchData] = useState<WxmpSearchAccount[]>([])

  // Validate default value from search params
  useEffect(() => {
    if (!keywordFromSearch) {
      return
    }
    trigger("keyword")
  }, [trigger, keywordFromSearch])

  const discoverSearchData = useDiscoverSearchData()?.[atomKey.current] || []
  const xiaohongshuSearchData = useXiaohongshuDiscoverSearchData()?.[atomKey.current] || []

  const mutation = useMutation({
    mutationFn: async ({ keyword, target }: { keyword: string; target: SearchTarget }) => {
      const inputType = detectInputType(keyword)

      // For RSS/RSSHub, validate and show feed form modal directly
      if (inputType === "rss") {
        const validated = rssSchema.safeParse({ keyword })
        if (!validated.success) {
          throw new Error("Invalid RSS URL")
        }
        present({
          title: t("feed_form.add_feed"),
          content: () => <FeedForm url={keyword} onSuccess={dismissAll} />,
        })
        return []
      }

      if (inputType === "rsshub") {
        const validated = rsshubSchema.safeParse({ keyword })
        if (!validated.success) {
          throw new Error("Invalid RSSHub route")
        }
        present({
          title: t("feed_form.add_feed"),
          content: () => <FeedForm url={keyword} onSuccess={dismissAll} />,
        })
        return []
      }

      // For search, perform discovery
      const trimmedKeyword = keyword.trim()
      const [{ data }, wxmpAccounts, xiaohongshuAccounts] = await Promise.all([
        followClient.api.discover.discover({
          keyword: trimmedKeyword,
          target,
        }),
        target === "feeds" ? searchWxmpAccounts(trimmedKeyword) : Promise.resolve([]),
        target === "feeds" ? fetchXiaohongshuAccounts(trimmedKeyword) : Promise.resolve([]),
      ])

      setDiscoverSearchData((prev) => ({
        ...prev,
        [atomKey.current]: data,
      }))
      setWxmpSearchData(wxmpAccounts)
      setXiaohongshuDiscoverSearchData((prev) => ({
        ...prev,
        [atomKey.current]: xiaohongshuAccounts,
      }))

      return data
    },
    onError(error) {
      toastFetchError(error)
    },
  })

  const handleKeywordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.currentTarget
      // During composition, update raw value without validation
      if ((event.nativeEvent as InputEvent)?.isComposing) {
        form.setValue("keyword", value, { shouldValidate: false })
        return
      }

      startTransition(() => {
        form.setValue("keyword", value, { shouldValidate: true })
        setSearchParams(
          (prev) => {
            const newParams = new URLSearchParams(prev)
            if (value.trim()) {
              newParams.set("keyword", value.trim())
            } else {
              newParams.delete("keyword")
            }
            return newParams
          },
          {
            replace: true,
          },
        )
      })
    },
    [form, setSearchParams],
  )

  const handleCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLInputElement>) => {
      const { value } = event.currentTarget
      form.setValue("keyword", value, { shouldValidate: true })
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev)
          if (value.trim()) {
            newParams.set("keyword", value.trim())
          } else {
            newParams.delete("keyword")
          }
          return newParams
        },
        {
          replace: true,
        },
      )
      window.requestAnimationFrame(() => {
        isComposingRef.current = false
      })
    },
    [form, setSearchParams],
  )

  const handleSuccess = useCallback(
    (item: DiscoveryItem) => {
      const currentData = getDiscoverSearchData()
      if (!currentData) return
      setDiscoverSearchData(
        produce(currentData, (draft) => {
          const sub = (draft[atomKey.current] || []).find((i) => {
            if (item.feed) {
              return i.feed?.id === item.feed.id
            }
            if (item.list) {
              return i.list?.id === item.list.id
            }
            return false
          })
          if (!sub) return
          sub.subscriptionCount = -~(sub.subscriptionCount as number)
        }),
      )
    },
    [atomKey],
  )

  const handleUnSubscribed = useCallback(
    (item: DiscoveryItem) => {
      const currentData = getDiscoverSearchData()
      if (!currentData) return
      setDiscoverSearchData(
        produce(currentData, (draft) => {
          const sub = (draft[atomKey.current] || []).find(
            (i) => i.feed?.id === item.feed?.id || i.list?.id === item.list?.id,
          )
          if (!sub) return
          sub.subscriptionCount = Number.isNaN(sub.subscriptionCount)
            ? 0
            : (sub.subscriptionCount as number) - 1
        }),
      )
    },
    [atomKey],
  )

  const handleTargetChange = useCallback(
    (value: string) => {
      form.setValue("target", value as SearchTarget)
    },
    [form],
  )

  function onSubmit(values: SearchFormData) {
    if (!ensureLogin()) {
      return
    }
    atomKey.current = values.keyword + values.target
    mutation.mutate({ keyword: values.keyword, target: values.target })
  }

  const showTargetSelector = detectedType === "search"
  const resultCount =
    discoverSearchData.length + xiaohongshuSearchData.length + wxmpSearchData.length

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          onSubmitCapture={(event) => {
            if (isComposingRef.current) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          className="w-full max-w-2xl"
          data-testid="discover-form"
        >
          <div className="rounded-2xl border border-fill-secondary bg-background/70 p-4 shadow-sm">
            <FormField
              control={form.control}
              name="keyword"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel className="mb-2 text-headline font-bold text-text">
                    {t("discover.any_url_or_keyword")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      data-testid="discover-form-input"
                      {...field}
                      value={field.value || ""}
                      onChange={handleKeywordChange}
                      onCompositionStart={() => {
                        isComposingRef.current = true
                      }}
                      onCompositionEnd={handleCompositionEnd}
                      placeholder="Enter URL, RSSHub route, or keyword..."
                      className="h-12 text-base"
                    />
                  </FormControl>
                  <FormMessage />
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-tertiary">
                    <span>💡 {t("discover.tips.auto_detect")}</span>
                    {detectedType === "search" && (
                      <>
                        <span>•</span>
                        <span>{t("discover.tips.search_keyword")}</span>
                      </>
                    )}
                    {detectedType === "rss" && (
                      <>
                        <span>•</span>
                        <a
                          href={`${repository.url}/wiki/Folo-Flavored-Feed-Spec`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-px text-accent hover:bg-accent/10"
                        >
                          <i className="i-mgc-book-6-cute-re" />
                          <span>Folo Flavored Feed Spec</span>
                        </a>
                      </>
                    )}
                    {detectedType === "rsshub" && (
                      <>
                        <span>•</span>
                        <a
                          href="https://docs.rsshub.app/"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-px text-accent hover:bg-accent/10"
                        >
                          <i className="i-mgc-book-6-cute-re" />
                          <span>RSSHub Docs</span>
                        </a>
                      </>
                    )}
                  </div>
                </FormItem>
              )}
            />
            {showTargetSelector && (
              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <FormLabel className="text-headline font-medium text-text-secondary">
                        {t("discover.target.label")}
                      </FormLabel>
                      <FormControl>
                        <div className="flex">
                          {isMobile ? (
                            <ResponsiveSelect
                              size="sm"
                              value={field.value}
                              onValueChange={handleTargetChange}
                              items={[
                                { label: t("discover.target.feeds"), value: "feeds" },
                                { label: t("discover.target.lists"), value: "lists" },
                              ]}
                            />
                          ) : (
                            <SegmentGroup
                              className="-mt-2 h-8"
                              value={field.value}
                              onValueChanged={handleTargetChange}
                            >
                              <SegmentItem value="feeds" label={t("discover.target.feeds")} />
                              <SegmentItem value="lists" label={t("discover.target.lists")} />
                            </SegmentGroup>
                          )}
                        </div>
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="center flex flex-col gap-3" data-testid="discover-form-actions">
              <div className="flex w-full items-center justify-center gap-1.5">
                <Button
                  data-testid="discover-form-submit"
                  disabled={!form.formState.isValid}
                  type="submit"
                  isLoading={mutation.isPending}
                  buttonClassName="sm:min-w-28"
                >
                  {detectedType !== "search" ? t("discover.preview") : t("words.search")}
                </Button>
                {detectedType === "search" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        data-testid="discover-channels-trigger"
                        type="button"
                        variant="ghost"
                        aria-label={t("discover.channels.settings_summary", {
                          count: supportedChannelCount,
                        })}
                        buttonClassName="h-9 px-2 text-text-tertiary hover:text-text"
                        textClassName="gap-1.5"
                        onClick={() => {
                          present({
                            title: t("discover.channels.title"),
                            content: () => <DiscoverChannelsPanel />,
                            modalClassName: "max-w-3xl w-full",
                          })
                        }}
                      >
                        <i className="i-mgc-settings-7-cute-re size-4" aria-hidden />
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-text-quaternary"
                          aria-hidden
                        >
                          <i className="i-mgc-rss-2-cute-fi size-3" />
                          <span>({supportedChannelCount})</span>
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipPortal>
                      <TooltipContent>
                        {t("discover.channels.settings_summary", {
                          count: supportedChannelCount,
                        })}
                      </TooltipContent>
                    </TooltipPortal>
                  </Tooltip>
                )}
              </div>

              {/* Compact Tools */}
              <div className="mt-5 flex items-center justify-center gap-3 text-xs">
                <ToolLink
                  icon="i-mgc-file-upload-cute-re"
                  label={t("discover.tools.import")}
                  onClick={() => {
                    present({
                      title: t("discover.tools.import"),
                      content: () => <DiscoverImport />,
                      modalClassName: "max-w-2xl w-full",
                    })
                  }}
                />
                <ToolLink
                  icon="i-mgc-web-cute-re"
                  label={t("discover.tools.transform")}
                  onClick={() => {
                    present({
                      title: t("discover.tools.transform"),
                      content: () => <DiscoverTransform />,
                      modalClassName: "max-w-2xl w-full",
                    })
                  }}
                />
                <ToolLink
                  icon="i-mgc-inbox-cute-re"
                  label={t("discover.tools.inbox")}
                  onClick={() => {
                    present({
                      title: t("words.inbox"),
                      content: () => <DiscoverInboxList />,
                      modalClassName: "max-w-2xl w-full",
                    })
                  }}
                />
                <ToolLink
                  icon="i-mgc-user-3-cute-re"
                  label={t("discover.tools.user")}
                  onClick={() => {
                    present({
                      title: t("words.user"),
                      content: () => <DiscoverUser />,
                      modalClassName: "max-w-2xl w-full",
                    })
                  }}
                />
              </div>
            </div>
          </div>
        </form>
      </Form>

      <div className="mt-8 w-full max-w-2xl">
        {(mutation.isSuccess || resultCount > 0) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
            {t("discover.search.results", { count: resultCount })}

            {resultCount > 0 && (
              <MotionButtonBase
                className="flex cursor-button items-center justify-between gap-2 hover:text-accent"
                type="button"
                onClick={() => {
                  setDiscoverSearchData({})
                  setXiaohongshuDiscoverSearchData({})
                  setWxmpSearchData([])
                  mutation.reset()
                }}
              >
                <i className="i-mgc-close-cute-re" />
              </MotionButtonBase>
            )}
          </div>
        )}
        <div className="space-y-4 text-sm">
          {wxmpSearchData.map((account) => (
            <button
              type="button"
              key={account.fakeid}
              className="w-full rounded-xl border border-fill-secondary bg-background p-4 text-left transition-colors hover:bg-fill-secondary"
              onClick={() => {
                present({
                  title: "抓取公众号文章",
                  content: () => <WechatChannelForm initialQuery={account.fakeid} />,
                  modalClassName: "max-w-2xl w-full",
                })
              }}
            >
              <div className="flex items-start gap-3">
                {account.avatar ? (
                  <img className="size-11 rounded-xl object-cover" src={account.avatar} alt="" />
                ) : (
                  <div className="center size-11 rounded-xl bg-green/10 text-green">
                    <i className="i-mgc-wechat-cute-fi size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold text-text">
                      {account.nickname}
                    </span>
                    <span className="rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green">
                      公众号
                    </span>
                  </div>
                  {(account.alias || account.signature) && (
                    <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                      {account.alias || account.signature}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm text-accent">选择后抓取</span>
              </div>
            </button>
          ))}
          {xiaohongshuSearchData.map((account) => (
            <XiaohongshuAccountCard key={account.userId} account={account} />
          ))}
          {discoverSearchData?.map((item) => (
            <DiscoverFeedCard
              key={item.feed?.id || item.list?.id}
              item={item}
              onSuccess={handleSuccess}
              onUnSubscribed={handleUnSubscribed}
              className="last:border-b-0"
            />
          ))}
        </div>
      </div>
    </>
  )
}
