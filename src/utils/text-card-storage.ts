export type TextCardTemplate = "xiaohongshu" | "xiaohongshu4" | "douyin2" | "douyin3";

export const TEXT_CARD_STORAGE_KEYS: Record<TextCardTemplate, string> = {
  xiaohongshu: "TEXT_CARD_CONTENT_XIAOHONGSHU",
  xiaohongshu4: "TEXT_CARD_CONTENT_XIAOHONGSHU4",
  douyin2: "TEXT_CARD_CONTENT_DOUYIN2",
  douyin3: "TEXT_CARD_CONTENT_DOUYIN3",
};

const SHARED_STORAGE_KEY = "TEXT_CARD_CONTENT";
const LAST_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE";
const SPLIT_MIGRATION_STORAGE_KEY = "TEXT_CARD_CONTENT_SPLIT_MIGRATED";

function getStoredTextCardContent(template: TextCardTemplate) {
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

export function initializeTextCardContent(
  template: TextCardTemplate,
  legacyStorageKey: string,
) {
  const storedContent = getStoredTextCardContent(template);
  const legacyContent = wx.getStorageSync(legacyStorageKey);
  const initialContent =
    typeof storedContent === "string"
      ? storedContent
      : typeof legacyContent === "string"
        ? legacyContent
        : undefined;

  wx.setStorageSync(LAST_TEMPLATE_STORAGE_KEY, template);
  return initialContent;
}
