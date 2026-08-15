import { checkTextContent } from "../../services/content-security";
import { saveImageToPhotosAlbum } from "../../utils/text-card-render";
import { trackTextCardCreated } from "../../services/analytics";

export type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3";

export function copyTextCardTemplate(content: string) {
  wx.setClipboardData({
    data: content,
    success: () => wx.showToast({ title: "模板已复制", icon: "success" }),
    fail: () => wx.showToast({ title: "复制失败", icon: "none" }),
  });
}

export function copyTextCardContent(content: string) {
  if (!content) return;
  wx.setClipboardData({
    data: content,
    success: () => wx.showToast({ title: "复制成功", icon: "success" }),
    fail: () => wx.showToast({ title: "复制失败", icon: "none" }),
  });
}

export async function readTextCardClipboard(): Promise<string | undefined> {
  try {
    const result = await new Promise<{ data: string }>((resolve, reject) =>
      wx.getClipboardData({
        success: (value) => resolve({ data: value.data }),
        fail: reject,
      }),
    );
    const content = result.data.trim();
    if (content) return content;
    wx.showToast({ title: "剪贴板为空", icon: "none" });
  } catch (_error) {
    wx.showToast({ title: "读取剪贴板失败", icon: "none" });
  }
  return undefined;
}

export async function saveTextCardImages(
  total: number,
  generate: (onProgress: (completed: number, total: number) => void) => Promise<string[]>,
) {
  wx.showLoading({ title: `生成 0/${total}`, mask: true });
  try {
    const urls = await generate((completed, count) => {
      wx.showLoading({ title: `生成 ${completed}/${count}`, mask: true });
    });
    if (!urls.length) {
      wx.showToast({ title: "暂无内容", icon: "none" });
      return;
    }

    for (const [index, url] of urls.entries()) {
      wx.showLoading({ title: `保存 ${index + 1}/${urls.length}`, mask: true });
      await saveImageToPhotosAlbum(url);
    }
    wx.showToast({ title: "已保存", icon: "success" });
    trackTextCardCreated();
  } catch (error) {
    console.error("保存图片失败", error);
    wx.showToast({ title: "保存失败", icon: "none" });
  } finally {
    wx.hideLoading();
  }
}

export function createTextCardPageData() {
  return {
    content: "",
    hasCustomContent: false,
    isExampleContent: false,
    renderedImageUrls: [] as string[],
    activeIndex: 0,
    isGenerating: false,
    isRenderingCards: false,
    renderError: false,
    renderErrorMessage: "生成失败，请重试",
    renderProgressText: "",
    showClearUndo: false,
    canvasReady: false,
  };
}

export function openTextCardEditor(source: TextCardTemplate) {
  wx.navigateTo({ url: `/pages/editor/index?source=${source}` });
}

export async function ensureTextCardContentSafe(content: string) {
  if (!content.trim()) return true;

  wx.showLoading({ title: "安全检测中", mask: true });
  try {
    await checkTextContent(content);
    return true;
  } catch (error) {
    wx.showToast({
      title: error instanceof Error ? error.message : "内容安全检测失败",
      icon: "none",
    });
    return false;
  } finally {
    wx.hideLoading();
  }
}
