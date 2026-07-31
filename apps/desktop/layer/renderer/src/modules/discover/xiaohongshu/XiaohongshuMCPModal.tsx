import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import { cn } from "@follow/utils/utils"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { useReplaceImgUrlIfNeed } from "~/lib/img-proxy"

interface XiaohongshuSearchNote {
  index: number
  title: string
  author: string
  likedCount: string
  commentCount: string
  collectedCount: string
  cover: string
  url: string
  noteId: string | null
  xsecToken: string | null
}

interface XiaohongshuNoteContent {
  title: string
  author: string
  publishedAt: string
  likedCount: string
  commentCount: string
  collectedCount: string
  url: string
  content: string
  cover: string
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function XiaohongshuMCPModal() {
  const { t } = useTranslation()
  const replaceImgUrlIfNeed = useReplaceImgUrlIfNeed()
  const [keywords, setKeywords] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [notes, setNotes] = useState<XiaohongshuSearchNote[]>([])
  const [rawSearchResult, setRawSearchResult] = useState("")
  const [selectedNote, setSelectedNote] = useState<XiaohongshuNoteContent | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null)
  const [loginQRCode, setLoginQRCode] = useState("")
  const [loginUsername, setLoginUsername] = useState("")
  const [pendingKeywords, setPendingKeywords] = useState<string | null>(null)

  const integrationServices = ipcServices?.integration
  const coverUrl = useMemo(
    () => replaceImgUrlIfNeed(selectedNote?.cover) || selectedNote?.cover,
    [replaceImgUrlIfNeed, selectedNote?.cover],
  )

  const canUseLocalMCP = Boolean(window.electron && integrationServices)

  const runSearch = useCallback(
    async (searchKeywords: string) => {
      if (!integrationServices) return

      const result = await integrationServices.searchXiaohongshuNotes({
        keywords: searchKeywords,
        endpoint: endpoint.trim() || undefined,
      })
      setNotes(result.notes)
      setRawSearchResult(result.raw)
      if (result.notes.length === 0) {
        toast.info(t("discover.xiaohongshu.no_results"))
      }
    },
    [endpoint, integrationServices, t],
  )

  useEffect(() => {
    if (!loginQRCode || !pendingKeywords || !integrationServices) return

    let disposed = false
    let isPolling = false
    const pollLoginStatus = async () => {
      if (isPolling) return
      isPolling = true
      try {
        const status = await integrationServices.getXiaohongshuLoginStatus({
          endpoint: endpoint.trim() || undefined,
        })
        if (!status.isLoggedIn || disposed) return

        const searchKeywords = pendingKeywords
        setLoginQRCode("")
        setPendingKeywords(null)
        setLoginUsername(status.username)
        toast.success(t("discover.xiaohongshu.login_success"))
        setIsSearching(true)
        try {
          await runSearch(searchKeywords)
        } catch (error) {
          toast.error(t("discover.xiaohongshu.search_failed"), {
            description: getErrorMessage(error),
          })
        } finally {
          setIsSearching(false)
        }
      } catch {
        // The next poll retries transient browser startup and login checks.
      } finally {
        isPolling = false
      }
    }

    void pollLoginStatus()
    const intervalId = window.setInterval(() => void pollLoginStatus(), 2_000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [endpoint, integrationServices, loginQRCode, pendingKeywords, runSearch, t])

  const handleSearch = async () => {
    const trimmedKeywords = keywords.trim()
    if (!trimmedKeywords) {
      toast.error(t("discover.xiaohongshu.keyword_required"))
      return
    }
    if (!integrationServices) {
      toast.error(t("discover.xiaohongshu.desktop_only"))
      return
    }

    setIsSearching(true)
    setIsPreparing(true)
    setSelectedNote(null)
    try {
      const status = await integrationServices.getXiaohongshuLoginStatus({
        endpoint: endpoint.trim() || undefined,
      })
      setIsPreparing(false)
      setLoginUsername(status.username)

      if (!status.isLoggedIn) {
        const qrCode = await integrationServices.getXiaohongshuLoginQRCode({
          endpoint: endpoint.trim() || undefined,
        })
        if (!qrCode.isLoggedIn && qrCode.image) {
          setLoginQRCode(qrCode.image)
          setPendingKeywords(trimmedKeywords)
          return
        }
      }

      setLoginQRCode("")
      setPendingKeywords(null)
      await runSearch(trimmedKeywords)
    } catch (error) {
      toast.error(t("discover.xiaohongshu.search_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setIsPreparing(false)
      setIsSearching(false)
    }
  }

  const handleFetch = async (note: XiaohongshuSearchNote) => {
    if (!integrationServices) {
      toast.error(t("discover.xiaohongshu.desktop_only"))
      return
    }

    setFetchingUrl(note.url)
    try {
      const result = await integrationServices.fetchXiaohongshuNote({
        url: note.url,
        endpoint: endpoint.trim() || undefined,
      })
      setSelectedNote(result)
    } catch (error) {
      toast.error(t("discover.xiaohongshu.fetch_failed"), {
        description: getErrorMessage(error),
      })
    } finally {
      setFetchingUrl(null)
    }
  }

  if (!canUseLocalMCP) {
    return (
      <div className="w-[640px] max-w-full space-y-3">
        <div className="rounded-lg border border-fill-secondary bg-fill-quaternary p-4 text-sm text-text-secondary">
          {t("discover.xiaohongshu.desktop_only")}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-[760px] max-w-full flex-col gap-5">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label className="text-xs text-text">{t("discover.xiaohongshu.keyword")}</Label>
          <div className="flex gap-2">
            <Input
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return
                }
                if (event.key === "Enter") {
                  event.preventDefault()
                  void handleSearch()
                }
              }}
              placeholder={t("discover.xiaohongshu.keyword_placeholder")}
              className="h-10 min-w-0 flex-1"
            />
            <Button
              type="button"
              isLoading={isSearching}
              buttonClassName="shrink-0 whitespace-nowrap"
              onClick={() => void handleSearch()}
            >
              {t("words.search")}
            </Button>
          </div>
          {isPreparing && (
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <i className="i-mgc-loading-3-cute-re size-3.5 animate-spin" />
              <span>{t("discover.xiaohongshu.preparing")}</span>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label className="text-xs text-text">{t("discover.xiaohongshu.endpoint")}</Label>
          <Input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder={t("discover.xiaohongshu.endpoint_placeholder")}
            className="h-10 text-xs"
          />
          <div className="text-xs text-text-tertiary">
            {t("discover.xiaohongshu.endpoint_help")}
          </div>
        </div>
      </div>

      {loginQRCode && (
        <div className="flex items-center gap-4 rounded-lg border border-fill-secondary bg-fill-quaternary p-4">
          <img
            src={loginQRCode}
            alt={t("discover.xiaohongshu.login_qrcode_alt")}
            className="size-36 shrink-0 rounded-md bg-white p-2"
          />
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium text-text">
              {t("discover.xiaohongshu.login_scan")}
            </div>
            <div className="text-xs leading-5 text-text-secondary">
              {t("discover.xiaohongshu.login_waiting")}
            </div>
          </div>
        </div>
      )}

      {!loginQRCode && loginUsername && (
        <div className="flex items-center gap-2 text-xs text-green">
          <i className="i-mgc-check-circle-cute-fi size-4" />
          <span>{t("discover.xiaohongshu.logged_in_as", { username: loginUsername })}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-h-[280px] rounded-lg border border-fill-secondary bg-fill-quaternary">
          <div className="flex items-center justify-between border-b border-fill-secondary px-3 py-2">
            <div className="text-sm font-medium text-text">
              {t("discover.xiaohongshu.results", { count: notes.length })}
            </div>
            {rawSearchResult.length > 0 && notes.length === 0 && (
              <span className="text-xs text-text-tertiary">
                {t("discover.xiaohongshu.raw_available")}
              </span>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {notes.length > 0 ? (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.url}
                    className={cn(
                      "rounded-md border border-fill-secondary bg-background p-3",
                      "transition-colors hover:border-accent/40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-fill-tertiary text-xs font-medium text-text-secondary">
                        {note.index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-medium text-text">
                          {note.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                          {note.author && <span>{note.author}</span>}
                          <span>{t("discover.xiaohongshu.likes", { value: note.likedCount })}</span>
                          {note.noteId && <span>{note.noteId}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <a
                        href={note.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-fill-secondary hover:text-text"
                      >
                        <i className="i-mgc-external-link-cute-re size-3.5" />
                        {t("discover.xiaohongshu.open")}
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        isLoading={fetchingUrl === note.url}
                        onClick={() => void handleFetch(note)}
                      >
                        {t("discover.xiaohongshu.fetch")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-tertiary">
                <i className="i-mgc-search-2-cute-re size-6" />
                <div>{t("discover.xiaohongshu.empty")}</div>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-[280px] rounded-lg border border-fill-secondary bg-fill-quaternary">
          <div className="border-b border-fill-secondary px-3 py-2 text-sm font-medium text-text">
            {t("discover.xiaohongshu.detail")}
          </div>

          {selectedNote ? (
            <div className="max-h-[420px] overflow-y-auto p-3">
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt={selectedNote.title}
                  className="mb-3 aspect-[4/3] w-full rounded-md object-cover"
                />
              )}
              <div className="text-base font-semibold text-text">{selectedNote.title}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
                {selectedNote.author && <span>{selectedNote.author}</span>}
                {selectedNote.publishedAt && <span>{selectedNote.publishedAt}</span>}
                {selectedNote.likedCount && (
                  <span>{t("discover.xiaohongshu.likes", { value: selectedNote.likedCount })}</span>
                )}
                {selectedNote.commentCount && (
                  <span>
                    {t("discover.xiaohongshu.comments", { value: selectedNote.commentCount })}
                  </span>
                )}
                {selectedNote.collectedCount && (
                  <span>
                    {t("discover.xiaohongshu.collects", { value: selectedNote.collectedCount })}
                  </span>
                )}
              </div>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {selectedNote.content || t("discover.xiaohongshu.no_content")}
              </div>
              {selectedNote.url && (
                <a
                  href={selectedNote.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-fill-secondary hover:text-text"
                >
                  <i className="i-mgc-external-link-cute-re size-3.5" />
                  {t("discover.xiaohongshu.open")}
                </a>
              )}
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-tertiary">
              <i className="i-mgc-file-search-cute-re size-6" />
              <div>{t("discover.xiaohongshu.detail_empty")}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
