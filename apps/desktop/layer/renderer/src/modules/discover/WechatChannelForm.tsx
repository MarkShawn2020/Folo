import { Button } from "@follow/components/ui/button/index.js"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@follow/components/ui/form/index.jsx"
import { Input } from "@follow/components/ui/input/index.js"
import { LoadingCircle } from "@follow/components/ui/loading/index.jsx"
import { Switch } from "@follow/components/ui/switch/index.jsx"
import { FeedViewType } from "@follow/constants"
import { cn } from "@follow/utils/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { ipcServices } from "~/lib/client"
import { getFetchErrorMessage, toastFetchError } from "~/lib/error-parser"

import type { WxmpFetchResult, WxmpLocalImportResult } from "./wxmp-local-import"
import { importWxmpChannelToLocalFeed } from "./wxmp-local-import"

const formSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(500),
  withContent: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

type FetchState = {
  result: WxmpFetchResult
  imported: WxmpLocalImportResult
}

const wxmpStatusQueryKey = ["wxmp", "status"] as const

interface WechatChannelFormProps {
  initialQuery?: string
}

export function WechatChannelForm({ initialQuery = "" }: WechatChannelFormProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigateEntry = useNavigateEntry()
  const [fetchState, setFetchState] = useState<FetchState | null>(null)
  const available = Boolean(window.electron?.ipcRenderer)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      query: initialQuery.trim(),
      limit: 20,
      withContent: true,
    },
    mode: "onChange",
  })

  const statusQuery = useQuery({
    queryKey: wxmpStatusQueryKey,
    queryFn: async () => {
      if (!available || !ipcServices?.wxmp) {
        throw new Error(t("discover.wxmp.unavailable"))
      }
      return ipcServices.wxmp.status()
    },
    enabled: available,
  })

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!available || !ipcServices?.wxmp) {
        throw new Error(t("discover.wxmp.unavailable"))
      }
      return ipcServices.wxmp.openLogin()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wxmpStatusQueryKey })
    },
    onError(error) {
      toastFetchError(error)
    },
  })

  const selectWcxMutation = useMutation({
    mutationFn: async () => {
      if (!available || !ipcServices?.wxmp) {
        throw new Error(t("discover.wxmp.unavailable"))
      }
      return ipcServices.wxmp.selectWcxBinary()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wxmpStatusQueryKey })
    },
    onError(error) {
      toastFetchError(error)
    },
  })

  const fetchMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!available || !ipcServices?.wxmp) {
        throw new Error(t("discover.wxmp.unavailable"))
      }

      const result = (await ipcServices.wxmp.fetchChannel(values)) as WxmpFetchResult
      const imported = await importWxmpChannelToLocalFeed(result)
      return { result, imported }
    },
    onSuccess: (state) => {
      setFetchState(state)
      toast.success(t("discover.wxmp.import_success"))
      queryClient.invalidateQueries({ queryKey: wxmpStatusQueryKey })
    },
    onError(error) {
      toastFetchError(error)
    },
  })

  const statusItems = useMemo(() => {
    const status = statusQuery.data
    return [
      {
        label: t("discover.wxmp.login_status"),
        value: status?.loggedIn
          ? t("discover.wxmp.logged_in")
          : available
            ? t("discover.wxmp.logged_out")
            : t("discover.wxmp.unavailable"),
      },
      {
        label: t("discover.wxmp.cache_accounts"),
        value: String(status?.accountCount ?? 0),
      },
      {
        label: t("discover.wxmp.cache_articles"),
        value: String(status?.articleCount ?? 0),
      },
      {
        label: t("discover.wxmp.cache_contents"),
        value: String(status?.contentCount ?? 0),
      },
    ]
  }, [available, statusQuery.data, t])

  const onSubmit = (values: FormValues) => {
    fetchMutation.mutate(values)
  }

  const statusMessage = useMemo(() => {
    if (!available) return t("discover.wxmp.unavailable")
    if (statusQuery.error) return getFetchErrorMessage(statusQuery.error)
    return statusQuery.data?.wcxPath || t("discover.wxmp.no_wcx")
  }, [available, statusQuery.data?.wcxPath, statusQuery.error, t])

  const openImportedFeed = () => {
    if (!fetchState) return
    navigateEntry({
      feedId: fetchState.imported.feedId,
      entryId: null,
      view: FeedViewType.Articles,
    })
  }

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statusItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-fill-secondary px-3 py-2">
            <div className="text-caption text-text-tertiary">{item.label}</div>
            <div className="mt-1 truncate text-sm font-medium text-text">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div
          className={cn("min-w-0 text-caption text-text-tertiary", statusQuery.error && "text-red")}
        >
          {statusQuery.isLoading ? (
            <span className="inline-flex items-center gap-2">
              <LoadingCircle size="small" />
              {t("discover.wxmp.checking")}
            </span>
          ) : (
            <span className="block truncate" title={statusMessage}>
              {statusMessage}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!available}
            isLoading={selectWcxMutation.isPending}
            onClick={() => selectWcxMutation.mutate()}
          >
            <i className="i-mgc-folder-open-cute-re mr-1.5" />
            {t("discover.wxmp.select_wcx")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!available}
            isLoading={loginMutation.isPending}
            onClick={() => loginMutation.mutate()}
          >
            <i className="i-mgc-qr-code-cute-re mr-1.5" />
            {t("discover.wxmp.login")}
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="query"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("discover.wxmp.account")}</FormLabel>
                <FormControl>
                  <Input
                    autoFocus
                    {...field}
                    placeholder={t("discover.wxmp.account_placeholder")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
            <FormField
              control={form.control}
              name="limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("discover.wxmp.limit")}</FormLabel>
                  <FormControl>
                    <Input min={1} max={500} type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="withContent"
              render={({ field }) => (
                <FormItem className="flex h-full items-center justify-between gap-3 rounded-lg border border-fill-secondary px-3 py-2">
                  <div className="min-w-0">
                    <FormLabel>{t("discover.wxmp.with_content")}</FormLabel>
                    <FormDescription>{t("discover.wxmp.with_content_description")}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!available || !form.formState.isValid}
              isLoading={fetchMutation.isPending}
            >
              <i className="i-mgc-download-2-cute-re mr-1.5" />
              {t("discover.wxmp.fetch")}
            </Button>
          </div>
        </form>
      </Form>

      {fetchState && (
        <div className="rounded-lg border border-fill-secondary">
          <div className="flex items-center justify-between gap-3 border-b border-fill-secondary px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-text">
                {fetchState.result.account.nickname}
              </div>
              <div className="text-caption text-text-tertiary">
                {t("discover.wxmp.imported_count", {
                  count: fetchState.imported.entryCount,
                })}
              </div>
            </div>
            <Button type="button" variant="outline" onClick={openImportedFeed}>
              {t("discover.wxmp.open_feed")}
            </Button>
          </div>
          <div className="max-h-[220px] divide-y divide-fill-secondary overflow-auto">
            {fetchState.result.articles.slice(0, 8).map((article) => (
              <a
                key={article.aid}
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-sm",
                  "transition-colors hover:bg-fill-secondary",
                )}
              >
                <span className="truncate text-text">{article.title}</span>
                <span className="text-caption text-text-tertiary">
                  {new Date(article.createTime * 1000).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
