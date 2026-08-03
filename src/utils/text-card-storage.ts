export type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3";

export const TEXT_CARD_STORAGE_KEYS: Record<TextCardTemplate, string> = {
  xiaohongshu: "TEXT_CARD_CONTENT_XIAOHONGSHU",
  douyin2: "TEXT_CARD_CONTENT_DOUYIN2",
  douyin3: "TEXT_CARD_CONTENT_DOUYIN3",
};

const SHARED_STORAGE_KEY = "TEXT_CARD_CONTENT";
const LAST_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE";
const SPLIT_MIGRATION_STORAGE_KEY = "TEXT_CARD_CONTENT_SPLIT_MIGRATED";

export function getStoredTextCardContent(template: TextCardTemplate) {
  const storageKey = TEXT_CARD_STORAGE_KEYS[template];
  const storedContent = wx.getStorageSync(storageKey);

  if (typeof storedContent === "string") return storedContent;
  if (wx.getStorageSync(SPLIT_MIGRATION_STORAGE_KEY) === true) return undefined;
  if (wx.getStorageSync(LAST_TEMPLATE_STORAGE_KEY) !== template) return undefined;

  const sharedContent = wx.getStorageSync(SHARED_STORAGE_KEY);
  wx.setStorageSync(SPLIT_MIGRATION_STORAGE_KEY, true);

  if (typeof sharedContent !== "string") return undefined;

  wx.setStorageSync(storageKey, sharedContent);
  return sharedContent;
}
