export interface WxmpLoginAccount {
  nickname: string | null
  username: string | null
  avatar: string | null
  alias: string | null
  serviceType: string | null
  bizuin: string | null
}

export interface WxmpSearchableAccount {
  fakeid: string
  nickname: string
  alias: string | null
}

const decodeHtmlEntities = (value: string) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#x22;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")

const isIdentifierCharacter = (character: string | undefined) => {
  if (!character) return false
  const code = character.codePointAt(0)!
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    character === "_" ||
    character === "$"
  )
}

const skipWhitespace = (source: string, start: number) => {
  let cursor = start
  while (cursor < source.length && source[cursor]?.trim() === "") {
    cursor += 1
  }
  return cursor
}

const readQuotedString = (source: string, start: number): string | null => {
  const quote = source[start]
  if (quote !== '"' && quote !== "'") return null

  let value = ""
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor]
    if (character === quote) return value
    if (character !== "\\") {
      value += character
      continue
    }

    const escaped = source[cursor + 1]
    if (!escaped) return null
    cursor += 1
    switch (escaped) {
      case "n": {
        value += "\n"
        break
      }
      case "r": {
        value += "\r"
        break
      }
      case "t": {
        value += "\t"
        break
      }
      default: {
        value += escaped
      }
    }
  }

  return null
}

const extractAssignedString = (source: string, field: string): string | null => {
  let offset = 0
  while (offset < source.length) {
    const index = source.indexOf(field, offset)
    if (index === -1) return null
    offset = index + field.length

    if (
      isIdentifierCharacter(source[index - 1]) ||
      isIdentifierCharacter(source[index + field.length])
    ) {
      continue
    }

    let cursor = index + field.length
    const precedingQuote = source[index - 1]
    if ((precedingQuote === '"' || precedingQuote === "'") && source[cursor] === precedingQuote) {
      cursor += 1
    }
    cursor = skipWhitespace(source, cursor)
    if (source[cursor] !== ":" && source[cursor] !== "=") continue
    cursor = skipWhitespace(source, cursor + 1)

    const value = readQuotedString(source, cursor)?.trim()
    if (value) return value
  }

  return null
}

const firstAssignedString = (source: string, fields: string[]) => {
  for (const field of fields) {
    const value = extractAssignedString(source, field)
    if (value) return value
  }
  return null
}

export const parseWxmpLoginAccount = (html: string): WxmpLoginAccount | null => {
  const source = decodeHtmlEntities(html)
  const account: WxmpLoginAccount = {
    nickname: firstAssignedString(source, ["real_nick_name", "nick_name", "nickname"]),
    username: firstAssignedString(source, ["user_name", "username"]),
    avatar: firstAssignedString(source, ["head_img", "head_url"]),
    alias: firstAssignedString(source, ["alias"]),
    serviceType: firstAssignedString(source, ["serviceType", "service_type"]),
    bizuin: firstAssignedString(source, ["bizuin"]),
  }

  return Object.values(account).some(Boolean) ? account : null
}

const normalizePlatformSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().replaceAll(/\s+/g, "")

export const isWxmpAccountSearchMatch = (account: WxmpSearchableAccount, query: string) => {
  const normalizedQuery = normalizePlatformSearchText(query)
  if (!normalizedQuery) return false

  return [account.nickname, account.alias, account.fakeid].some((value) =>
    normalizePlatformSearchText(value || "").includes(normalizedQuery),
  )
}
