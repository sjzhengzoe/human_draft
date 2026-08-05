import { checkTextContent } from "../../services/content-security";
import { APP_FONTS } from "../../config/fonts";
import { loadAppFont } from "../../services/font-loader";
import {
  cacheTextCardPreview,
  getCachedTextCardPreview,
} from "../../services/text-card-preview-cache";
import {
  getStoredTextCardContent,
  TEXT_CARD_STORAGE_KEYS,
} from "../../utils/text-card-storage";

  type ActionKey = "paste" | "copy" | "edit" | "clear" | "export";
  type RenderQuality = "preview" | "export";
  type RenderProgress = (completed: number, total: number) => void;

  type CanvasMetrics = {
    width: number;
    height: number;
    scale: number;
  };

  type TextPart = {
    text: string;
  };

  type Paragraph = {
    parts: TextPart[];
    isTitle: boolean;
    isSpacer: boolean;
  };

  type ClearSnapshot = {
    content: string;
    activeIndex: number;
  };

  type SyncContentOptions = {
    isExample?: boolean;
    persist?: boolean;
  };

  type Canvas2DNode = {
    width: number;
    height: number;
    getContext: (contextId: "2d") => Canvas2DContext;
    createImage: () => {
      src: string;
      onload: (() => void) | null;
      onerror: ((error: unknown) => void) | null;
    };
  };

  type Canvas2DContext = {
    fillStyle: string;
    font: string;
    textAlign: "left" | "right" | "center" | "start" | "end";
    textBaseline:
      | "top"
      | "hanging"
      | "middle"
      | "alphabetic"
      | "ideographic"
      | "bottom";
    clearRect: (x: number, y: number, width: number, height: number) => void;
    drawImage: (
      image: unknown,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => void;
    fillRect: (x: number, y: number, width: number, height: number) => void;
    fillText: (text: string, x: number, y: number) => void;
    measureText: (text: string) => { width: number };
    scale: (x: number, y: number) => void;
  };

  const STORAGE_KEY = TEXT_CARD_STORAGE_KEYS.douyin2;
  const LEGACY_STORAGE_KEY = "DOUYIN2_FORM_DATA_CONTENT";
  const TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "douyin2ExportCanvas";
  const PREVIEW_CACHE_VERSION = "douyin2-v2";
  const BASE_CANVAS_WIDTH = 300;
  const BASE_CANVAS_HEIGHT = 400;
  const CANVAS_WIDTH = 2160;
  const PREVIEW_CANVAS_WIDTH = 1080;
  const CANVAS_SCALE = CANVAS_WIDTH / BASE_CANVAS_WIDTH;
  const CANVAS_HEIGHT = Math.round(BASE_CANVAS_HEIGHT * CANVAS_SCALE);
  const CANVAS_PADDING_LEFT = scaleCanvasValue(22);
  const CANVAS_SAFE_Y = scaleCanvasValue(38);
  const CANVAS_BODY_FONT_SIZE = scaleCanvasValue(12);
  const CANVAS_TITLE_FONT_SIZE = scaleCanvasValue(14);
  const CANVAS_BODY_LINE_HEIGHT = scaleCanvasValue(12 * 1.72);
  const CANVAS_TITLE_LINE_HEIGHT = scaleCanvasValue(14 * 1.5);
  const CANVAS_SPACER_HEIGHT = scaleCanvasValue(13);
  const CANVAS_TITLE_BOTTOM_GAP = scaleCanvasValue(9);
  const CANVAS_TITLE_NEXT_GAP = scaleCanvasValue(20);
  const DOUYIN2_FONT_FAMILY = APP_FONTS.ui.family;
  const CANVAS_TEXT_FONT_FAMILY = `"${DOUYIN2_FONT_FAMILY}", "Songti SC", STSong, "Noto Serif CJK SC", serif`;
  const CANVAS_BODY_FONT = `normal ${CANVAS_BODY_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_TITLE_FONT = `bold ${CANVAS_TITLE_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_MAX_CHARS_PER_LINE = 21;
  const CANVAS_TITLE_MAX_CHARS_PER_LINE = 18;
  const DOUYIN_TAGS = "#文字的力量 #记录真实生活 #思考 #讨论";
  const CLEAR_UNDO_DURATION = 5000;
  const DEFAULT_CONTENT = `［2026.06.21 xxx］

那些惴惴不安的未来
我觉得它们
都是明亮的

［2026.06.24 xxx］

我们都很仔细地思考
定义过 所谓的幸福生活
不过 我们都没有认真地活
但是我又觉得
没有认真生活也没什么
偶尔难过失落也没什么
嗯如果有你在的话

［2026.06.24 xxx］

没想过要拯救地球 
没想过要多有钱 多快乐
想吃好 喝好 想有肌肉
想我爱的人开心自己也能开心 
爱我的人不要失望 
舒舒服服地 苟且偷生 也不错`;
  const COPY_TEMPLATE_CONTENT = [
    "［这里填写第一张卡片的标题］",
    "这里填写第一张卡片的内容",
    "",
    "［这里填写第二张卡片的标题］",
    "这里填写第二张卡片的内容",
    "",
    "［这里填写第三张卡片的标题］",
    "这里填写第三张卡片的内容",
  ].join("\n");

  let renderRequestId = 0;
  let renderChain = Promise.resolve();
  let clearUndoSnapshot: ClearSnapshot | undefined;
  let clearUndoTimer: ReturnType<typeof setTimeout> | undefined;

  Component({
    data: {
      content: "",
      hasCustomContent: false,
      isExampleContent: false,
      pages: [] as Paragraph[][],
      renderedImageUrls: [] as string[],
      activeIndex: 0,
      isGenerating: false,
      isRenderingCards: false,
      renderError: false,
      renderErrorMessage: "生成失败，请重试",
      renderProgressText: "",
      showClearUndo: false,
      canvasReady: false,
    },
    lifetimes: {
      attached() {
        const storedContent = getStoredTextCardContent("douyin2");
        const legacyContent = wx.getStorageSync(LEGACY_STORAGE_KEY);
        const initialContent =
          typeof storedContent === "string"
            ? storedContent
            : typeof legacyContent === "string"
              ? legacyContent
              : undefined;

        wx.setStorageSync(TEMPLATE_STORAGE_KEY, "douyin2");

        if (typeof initialContent === "string") {
          this.loadStoredContent(initialContent);
        } else {
          this.syncContent(DEFAULT_CONTENT, 0, {
            isExample: true,
            persist: false,
          });
        }
        this.loadDouyin2Font();
      },
      ready() {
        this.setData({ canvasReady: true }, () => {
          if (!this.data.renderedImageUrls.length) {
            this.refreshRenderedImages();
          }
        });
      },
      detached() {
        renderRequestId += 1;
        if (clearUndoTimer) clearTimeout(clearUndoTimer);
        clearUndoTimer = undefined;
        clearUndoSnapshot = undefined;
      },
    },
    pageLifetimes: {
      show() {
        const storedContent = wx.getStorageSync(STORAGE_KEY);

        if (
          typeof storedContent === "string" &&
          storedContent !== this.data.content
        ) {
          this.finalizeClearUndo();
          this.loadStoredContent(storedContent, this.data.activeIndex);
        }
      },
    },
    methods: {
      handleTemplateChange(event: WechatMiniprogram.TouchEvent) {
        if (this.data.isGenerating) return;
        const template = event.currentTarget.dataset.template;
        if (template !== "xiaohongshu" && template !== "douyin3") return;

        this.finalizeClearUndo();
        wx.redirectTo({ url: `/pages/${template}/index` });
      },

      handleCopyTemplate() {
        wx.setClipboardData({
          data: COPY_TEMPLATE_CONTENT,
          success: () => {
            wx.showToast({ title: "模板已复制", icon: "success" });
          },
          fail: () => {
            wx.showToast({ title: "复制失败", icon: "none" });
          },
        });
      },

      loadDouyin2Font() {
        ensureDouyin2FontLoaded()
          .then(() => {
            if (
              this.data.canvasReady &&
              !this.data.isRenderingCards &&
              !this.data.renderedImageUrls.length
            ) {
              this.refreshRenderedImages();
            }
          })
          .catch((error) => {
            console.warn("加载抖音 2 字体失败，使用系统字体回退", error);
          });
      },

      loadStoredContent(content: string, activeIndex = 0) {
        this.syncContent(content, activeIndex);
      },

      handleAction(
        event: WechatMiniprogram.CustomEvent<{ key?: ActionKey }>,
      ) {
        if (this.data.isGenerating) return;

        const key = event.detail.key;

        if (key === "paste") {
          this.handlePasteContent();
          return;
        }

        if (key === "copy") {
          this.handleCopyContent();
          return;
        }

        if (key === "edit") {
          this.openEditModal();
          return;
        }

        if (key === "clear") {
          this.clearContent();
          return;
        }

        if (key === "export") {
          this.handleSaveImages();
        }
      },

      handleSwiperChange(event: WechatMiniprogram.SwiperChange) {
        this.setData({
          activeIndex: event.detail.current,
        });
      },

      openEditModal() {
        wx.navigateTo({
          url: "/pages/editor/index?source=douyin2",
        });
      },

      clearContent() {
        if (!this.data.hasCustomContent) return;

        if (clearUndoTimer) clearTimeout(clearUndoTimer);
        clearUndoSnapshot = {
          content: this.data.content,
          activeIndex: this.data.activeIndex,
        };
        this.syncContent("");
        this.setData({ showClearUndo: true });
        clearUndoTimer = setTimeout(() => {
          this.finalizeClearUndo();
        }, CLEAR_UNDO_DURATION);
      },

      handleUndoClear() {
        if (!clearUndoSnapshot) return;

        const snapshot = clearUndoSnapshot;
        this.finalizeClearUndo();
        this.syncContent(snapshot.content, snapshot.activeIndex);
      },

      finalizeClearUndo() {
        if (clearUndoTimer) clearTimeout(clearUndoTimer);
        clearUndoTimer = undefined;
        clearUndoSnapshot = undefined;
        if (this.data.showClearUndo) {
          this.setData({ showClearUndo: false });
        }
      },

      handlePasteContent() {
        wx.getClipboardData({
          success: async (result) => {
            const pastedContent = result.data.trim();
            if (!pastedContent) {
              wx.showToast({
                title: "剪贴板为空",
                icon: "none",
              });
              return;
            }

            const currentContent = this.data.hasCustomContent
              ? this.data.content
              : "";
            const content = appendPastedContent(currentContent, pastedContent);
            if (!(await this.ensureSafeContent(pastedContent))) return;

            this.finalizeClearUndo();
            this.syncContent(content);
            wx.showToast({
              title: currentContent ? "已追加" : "已粘贴",
              icon: "success",
            });
          },
          fail: () => {
            wx.showToast({
              title: "读取剪贴板失败",
              icon: "none",
            });
          },
        });
      },

      handleCopyContent() {
        if (!this.data.hasCustomContent) return;

        const text = getCopyableContent(this.data.content);
        if (!text) return;

        wx.setClipboardData({
          data: text,
          success: () => {
            wx.showToast({
              title: "复制成功",
              icon: "success",
            });
          },
          fail: () => {
            wx.showToast({
              title: "复制失败",
              icon: "none",
            });
          },
        });
      },

      async handleSaveImages() {
        if (this.data.isGenerating) return;
        if (!this.data.hasCustomContent) return;

        this.setData({ isGenerating: true });
        const total = this.data.pages.length;
        wx.showLoading({ title: `生成 0/${total}`, mask: true });

        try {
          const urls = await this.renderPagesToImages(
            "export",
            undefined,
            (completed, count) => {
              wx.showLoading({ title: `生成 ${completed}/${count}`, mask: true });
            },
          );
          if (!urls.length) {
            wx.showToast({
              title: "暂无内容",
              icon: "none",
            });
            return;
          }

          for (const [index, url] of urls.entries()) {
            wx.showLoading({ title: `保存 ${index + 1}/${urls.length}`, mask: true });
            await saveImageToPhotosAlbum(url);
          }

          wx.showToast({
            title: "已保存",
            icon: "success",
          });
        } catch (error) {
          console.error("保存图片失败", error);
          wx.showToast({
            title: "保存失败",
            icon: "none",
          });
        } finally {
          wx.hideLoading();
          this.setData({ isGenerating: false });
        }
      },

      async refreshRenderedImages() {
        if (!this.data.canvasReady || !this.data.pages.length) return;

        const requestId = ++renderRequestId;
        const previewSignature = getPreviewSignature(this.data.content);
        this.setData({
          isRenderingCards: true,
          renderError: false,
          renderErrorMessage: "生成失败，请重试",
          renderProgressText: `0/${this.data.pages.length}`,
        });

        try {
          const urls = await this.renderPagesToImages(
            "preview",
            requestId,
            (completed, total) => {
              if (requestId === renderRequestId) {
                this.setData({ renderProgressText: `${completed}/${total}` });
              }
            },
          );
          if (requestId !== renderRequestId) return;

          this.setData({
            renderedImageUrls: urls,
            renderError: false,
          });
          cacheTextCardPreview("douyin2", previewSignature, urls);
        } catch (error) {
          if (requestId === renderRequestId) {
            console.error("生成页面卡片失败", error);
            this.setData({
              renderError: true,
              renderErrorMessage: getRenderErrorMessage(error),
            });
          }
        } finally {
          if (requestId === renderRequestId) {
            this.setData({ isRenderingCards: false, renderProgressText: "" });
          }
        }
      },

      retryPreview() {
        if (this.data.isRenderingCards) return;
        this.refreshRenderedImages();
      },

      renderPagesToImages(
        quality: RenderQuality,
        previewRequestId?: number,
        onProgress?: RenderProgress,
      ): Promise<string[]> {
        const pages = this.data.pages;
        const metrics = createCanvasMetrics(quality);
        const isStalePreview = () =>
          quality === "preview" && previewRequestId !== renderRequestId;

        return enqueueRender(async () => {
          if (isStalePreview()) return [];

          try {
            await ensureDouyin2FontLoaded();
          } catch (error) {
            console.warn("抖音 2 字体不可用，使用系统字体回退", error);
          }

          const urls: string[] = [];
          if (!pages.length || isStalePreview()) return urls;

          const canvas = await this.getExportCanvas();
          const backgroundImage = await loadCanvasImage(canvas, BACKGROUND_IMAGE);

          for (const [index, page] of pages.entries()) {
            if (isStalePreview()) return [];
            urls.push(
              await this.generatePageImage(
                page,
                index,
                canvas,
                backgroundImage,
                metrics,
              ),
            );
            onProgress?.(urls.length, pages.length);
          }

          return urls;
        });
      },

      async generatePageImage(
        page: Paragraph[],
        pageIndex: number,
        canvas: Canvas2DNode,
        backgroundImage: unknown,
        metrics: CanvasMetrics,
      ): Promise<string> {
        const ctx = canvas.getContext("2d");

        canvas.width = metrics.width;
        canvas.height = metrics.height;
        ctx.scale(metrics.scale, metrics.scale);

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "rgba(255, 251, 240, 0.26)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "#000000";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        const layout = createPageLayout(page);
        if (getLayoutHeight(layout) > CANVAS_HEIGHT - CANVAS_SAFE_Y * 2) {
          throw new Error(`第 ${pageIndex + 1} 页内容过长，请精简后重试`);
        }
        const textTop = Math.max(
          CANVAS_SAFE_Y,
          Math.round((CANVAS_HEIGHT - getLayoutHeight(layout)) / 2),
        );
        let y = textTop;

        layout.forEach((item) => {
          if (item.type === "spacer") {
            y += item.height;
            return;
          }

          item.lines.forEach((line) => {
            drawPartsLine(ctx, line.parts, CANVAS_PADDING_LEFT, y, item);
            y += item.lineHeight;
          });

          y += item.afterGap;
        });

        return canvasToTempFilePath(canvas, metrics);
      },

      getExportCanvas(): Promise<Canvas2DNode> {
        return new Promise((resolve, reject) => {
          this.createSelectorQuery()
            .select(`#${CANVAS_ID}`)
            .node((result) => {
              if (result && result.node) {
                resolve(result.node as Canvas2DNode);
                return;
              }

              reject(new Error("未找到导出 canvas"));
            })
            .exec();
        });
      },

      syncContent(
        content: string,
        activeIndex = 0,
        options: SyncContentOptions = {},
      ) {
        const isExampleContent = Boolean(options.isExample && content.trim());
        const hasCustomContent = Boolean(content.trim()) && !isExampleContent;
        const pages = content.trim() ? getPages(content) : [];
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(pages.length - 1, 0),
        );
        const cachedUrls = pages.length
          ? getCachedTextCardPreview("douyin2", getPreviewSignature(content))
          : undefined;
        const renderedImageUrls =
          cachedUrls ||
          (pages.length &&
          this.data.renderedImageUrls.length > nextActiveIndex
            ? this.data.renderedImageUrls.slice(0, pages.length)
            : []);
        renderRequestId += 1;

        this.setData(
          {
            content,
            hasCustomContent,
            isExampleContent,
            pages,
            renderedImageUrls,
            isRenderingCards: false,
            renderError: false,
            renderErrorMessage: "生成失败，请重试",
            renderProgressText: "",
            activeIndex: nextActiveIndex,
          },
          () => {
            if (!cachedUrls) this.refreshRenderedImages();
          },
        );

        if (options.persist !== false) {
          wx.setStorageSync(STORAGE_KEY, content);
        }
      },

      async ensureSafeContent(content: string) {
        if (!content.trim()) return true;

        wx.showLoading({ title: "安全检测中", mask: true });
        try {
          await checkTextContent(content);
          return true;
        } catch (error) {
          wx.showToast({
            title:
              error instanceof Error
                ? error.message
                : "内容安全检测失败",
            icon: "none",
          });
          return false;
        } finally {
          wx.hideLoading();
        }
      },
    },
  });

  function getCopyableContent(content: string) {
    const rawLines = normalizeText(content)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && line !== "/");
    const hasPageTitles = rawLines.some(isPageBreakLine);
    const lines = rawLines.filter((line) => !isPageBreakLine(line));

    if (!lines.length) return "";

    const titleIndex = lines.findIndex(Boolean);
    if (titleIndex < 0) return "";

    const bodyLines = hasPageTitles
      ? trimEmptyLines(lines)
      : trimEmptyLines(lines.slice(titleIndex + 1));
    if (!bodyLines.length) return DOUYIN_TAGS;

    return [bodyLines.join("\n"), DOUYIN_TAGS].join("\n\n");
  }

  function getPreviewSignature(content: string) {
    return `${PREVIEW_CACHE_VERSION}\u0000${content}`;
  }

  function getPages(content: string) {
    return getContentSlides(content)
      .map((slide) => getParagraphs(slide))
      .filter((page) => page.some((paragraph) => !paragraph.isSpacer));
  }

  function getParagraphs(text: string) {
    let hasTitle = false;

    return getParagraphLines(text).map((line) => {
      const isSpacer = line === "";
      const isTitle = !isSpacer && !hasTitle;

      if (isTitle) {
        hasTitle = true;
      }

      return {
        parts: isSpacer ? [] : [{ text: line }],
        isTitle,
        isSpacer,
      };
    });
  }

  function getParagraphLines(text: string) {
    const lines = normalizeText(text)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && line !== "/");

    return trimEmptyLines(lines);
  }

  function getContentSlides(content: string) {
    const lines = normalizeText(content)
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !line.trim().startsWith("#") && line.trim() !== "/");
    const slides = lines.reduce<string[][]>(
      (result, line) => {
        const currentSlide = result[result.length - 1];

        if (isPageBreakLine(line) && currentSlide.some(Boolean)) {
          result.push([]);
        }

        result[result.length - 1].push(line);
        return result;
      },
      [[]],
    );

    return slides.map((item) => item.join("\n").trim()).filter(Boolean);
  }

  function isPageBreakLine(line: string) {
    const text = line.trim();
    return (
      (text.startsWith("［") && text.endsWith("］")) ||
      (text.startsWith("[") && text.endsWith("]"))
    );
  }

  function appendPastedContent(currentContent: string, pastedContent: string) {
    const current = currentContent.trim();
    const pasted = pastedContent.trim();
    if (!current) return pasted;

    const firstPastedLine = normalizeText(pasted)
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    if (firstPastedLine && isPageBreakLine(firstPastedLine)) {
      return `${current}\n\n${pasted}`;
    }

    const nextPage = getContentSlides(current).length + 1;
    const pageTitle = `［第 ${nextPage} 张］`;
    return `${current}\n\n${pageTitle}\n${pasted}`;
  }

  function trimEmptyLines(lines: string[]) {
    const result = [...lines];

    while (result[0] === "") {
      result.shift();
    }

    while (result[result.length - 1] === "") {
      result.pop();
    }

    return result;
  }

  function normalizeText(text: string) {
    return text.replace(/\r\n/g, "\n").replace(/`/g, "");
  }

  function getRenderErrorMessage(error: unknown) {
    if (
      error instanceof Error &&
      /^第 \d+ 页内容过长/.test(error.message)
    ) {
      return error.message;
    }
    return "生成失败，请重试";
  }

  type LayoutLine = {
    parts: TextPart[];
  };

  type LayoutItem =
    | { type: "spacer"; height: number }
    | {
        type: "text";
        lines: LayoutLine[];
        font: string;
        lineHeight: number;
        afterGap: number;
        isTitle: boolean;
      };

  function createPageLayout(page: Paragraph[]): LayoutItem[] {
    const layout: LayoutItem[] = [];

    page.forEach((paragraph, index) => {
      if (paragraph.isSpacer) {
        layout.push({ type: "spacer", height: CANVAS_SPACER_HEIGHT });
        return;
      }

      const nextParagraph = page[index + 1];
      const isNextSpacer = !!nextParagraph && nextParagraph.isSpacer;
      const lines = wrapParts(
        paragraph.parts,
        paragraph.isTitle
          ? CANVAS_TITLE_MAX_CHARS_PER_LINE
          : CANVAS_MAX_CHARS_PER_LINE,
      );

      layout.push({
        type: "text",
        lines,
        font: paragraph.isTitle ? CANVAS_TITLE_FONT : CANVAS_BODY_FONT,
        lineHeight: paragraph.isTitle
          ? CANVAS_TITLE_LINE_HEIGHT
          : CANVAS_BODY_LINE_HEIGHT,
        afterGap: paragraph.isTitle
          ? isNextSpacer
            ? CANVAS_TITLE_NEXT_GAP
            : CANVAS_TITLE_BOTTOM_GAP
          : 0,
        isTitle: paragraph.isTitle,
      });
    });

    return layout;
  }

  function wrapParts(parts: TextPart[], maxChars: number): LayoutLine[] {
    const lines: LayoutLine[] = [];
    let currentParts: TextPart[] = [];
    let currentWidth = 0;

    parts.forEach((part) => {
      Array.from(part.text).forEach((char) => {
        const charWidth = /[ -~]/.test(char) ? 0.56 : 1;

        if (currentParts.length && currentWidth + charWidth > maxChars) {
          lines.push({ parts: currentParts });
          currentParts = [];
          currentWidth = 0;
        }

        const lastPart = currentParts[currentParts.length - 1];
        if (lastPart) {
          lastPart.text += char;
        } else {
          currentParts.push({ text: char });
        }
        currentWidth += charWidth;
      });
    });

    if (currentParts.length) {
      lines.push({ parts: currentParts });
    }

    return lines.length ? lines : [{ parts }];
  }

  function getLayoutHeight(layout: LayoutItem[]) {
    return layout.reduce((total, item) => {
      if (item.type === "spacer") {
        return total + item.height;
      }

      return total + item.lines.length * item.lineHeight + item.afterGap;
    }, 0);
  }

  function drawPartsLine(
    ctx: Canvas2DContext,
    parts: TextPart[],
    x: number,
    y: number,
    layoutItem: Extract<LayoutItem, { type: "text" }>,
  ) {
    let currentX = x;

    parts.forEach((part) => {
      ctx.font = layoutItem.isTitle ? CANVAS_TITLE_FONT : layoutItem.font;

      ctx.fillText(part.text, currentX, y);

      const width = ctx.measureText(part.text).width;
      currentX += width;
    });
  }

  function scaleCanvasValue(value: number) {
    return Math.round(value * CANVAS_SCALE);
  }

  function createCanvasMetrics(quality: RenderQuality): CanvasMetrics {
    const width = quality === "preview" ? PREVIEW_CANVAS_WIDTH : CANVAS_WIDTH;
    const scale = width / CANVAS_WIDTH;

    return {
      width,
      height: Math.round(CANVAS_HEIGHT * scale),
      scale,
    };
  }

  function saveImageToPhotosAlbum(filePath: string) {
    return new Promise<void>((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: reject,
      });
    });
  }

  function loadCanvasImage(canvas: Canvas2DNode, src: string) {
    return new Promise<unknown>((resolve, reject) => {
      const image = canvas.createImage();

      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function canvasToTempFilePath(
    canvas: Canvas2DNode,
    metrics: CanvasMetrics,
  ) {
    return new Promise<string>((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        width: metrics.width,
        height: metrics.height,
        destWidth: metrics.width,
        destHeight: metrics.height,
        fileType: "png",
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      });
    });
  }

  function ensureDouyin2FontLoaded() {
    return loadAppFont(APP_FONTS.ui);
  }

  function enqueueRender<T>(task: () => Promise<T>) {
    const run = renderChain.then(task, task);
    renderChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
