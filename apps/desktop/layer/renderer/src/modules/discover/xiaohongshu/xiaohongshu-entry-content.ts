interface XiaohongshuEntryDetail {
  title: string
  content: string
  cover?: string
}

type FetchXiaohongshuEntryDetail = (input: { url: string }) => Promise<XiaohongshuEntryDetail>

const escapeHTML = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

export const formatXiaohongshuEntryContent = (
  content: string,
  fallbackTitle: string,
  cover?: string,
) => {
  const image = cover?.trim()
    ? `<figure><img src="${escapeHTML(cover.trim())}" alt="" /></figure>`
    : ""
  const source = content.trim() || (image ? "" : fallbackTitle.trim())
  if (!source) return image

  const paragraphs = source
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHTML(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("")
  return `${image}${paragraphs}`
}

export const loadXiaohongshuEntryContent = async ({
  url,
  fetchDetail,
}: {
  url: string
  fetchDetail: FetchXiaohongshuEntryDetail
}) => {
  const detail = await fetchDetail({ url })
  return formatXiaohongshuEntryContent(detail.content, detail.title, detail.cover)
}
