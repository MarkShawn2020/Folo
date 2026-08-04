import { createAtomHooks } from "@follow/utils"
import type { DiscoveryItem } from "@follow-app/client-sdk"
import { atom, useAtomValue } from "jotai"

import type { XiaohongshuSearchAccount } from "../xiaohongshu/types"

const internalAtom = atom<Record<string, DiscoveryItem[]>>({})
export const [, , useDiscoverSearchData, , getDiscoverSearchData, setDiscoverSearchData] =
  createAtomHooks(internalAtom)

const xiaohongshuInternalAtom = atom<Record<string, XiaohongshuSearchAccount[]>>({})
export const [
  ,
  ,
  useXiaohongshuDiscoverSearchData,
  ,
  getXiaohongshuDiscoverSearchData,
  setXiaohongshuDiscoverSearchData,
] = createAtomHooks(xiaohongshuInternalAtom)

const hasDiscoverSearchDataAtom = atom(
  (get) =>
    Object.keys(get(internalAtom)).length > 0 ||
    Object.keys(get(xiaohongshuInternalAtom)).length > 0,
)

export const useHasDiscoverSearchData = () => {
  return useAtomValue(hasDiscoverSearchDataAtom)
}
