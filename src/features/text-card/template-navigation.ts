export type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3";

const TEXT_CARD_PAGE_ROUTES: Record<TextCardTemplate, string> = {
  xiaohongshu: "pages/xiaohongshu/index",
  douyin2: "pages/douyin2/index",
  douyin3: "pages/douyin3/index",
};

export function switchTextCardTemplate(
  target: unknown,
  current: TextCardTemplate,
  beforeNavigate: () => void,
) {
  if (!isTextCardTemplate(target) || target === current) return;

  beforeNavigate();
  const targetRoute = TEXT_CARD_PAGE_ROUTES[target];
  const pages = getCurrentPages();
  const existingPageIndex = findExistingTemplatePage(pages, targetRoute);

  if (existingPageIndex >= 0) {
    wx.navigateBack({ delta: pages.length - 1 - existingPageIndex });
    return;
  }

  const url = `/${targetRoute}`;
  wx.navigateTo({
    url,
    fail: () => wx.redirectTo({ url }),
  });
}

export function navigateBackFromTextCardTemplates() {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    wx.switchTab({ url: "/pages/create/index" });
    return;
  }

  let delta = 1;
  for (let index = pages.length - 2; index >= 0; index -= 1) {
    if (!isTextCardRoute(pages[index].route)) break;
    delta += 1;
  }
  wx.navigateBack({ delta });
}

function findExistingTemplatePage(
  pages: WechatMiniprogram.Page.Instance<WechatMiniprogram.IAnyObject, WechatMiniprogram.IAnyObject>[],
  targetRoute: string,
) {
  for (let index = pages.length - 2; index >= 0; index -= 1) {
    const route = pages[index].route;
    if (!isTextCardRoute(route)) break;
    if (route === targetRoute) return index;
  }
  return -1;
}

function isTextCardRoute(route: string | undefined) {
  return Object.values(TEXT_CARD_PAGE_ROUTES).includes(route || "");
}

function isTextCardTemplate(value: unknown): value is TextCardTemplate {
  return value === "xiaohongshu" || value === "douyin2" || value === "douyin3";
}
