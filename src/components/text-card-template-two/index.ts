import { APP_FONTS } from "../../config/fonts";
import { loadAppFont } from "../../services/font-loader";
import {
  copyTextCardContent,
  copyTextCardTemplate,
  createTextCardPageData,
  ensureTextCardContentSafe,
  openTextCardEditor,
  readTextCardClipboard,
  saveTextCardImages,
} from "../../features/text-card/page-actions";
import {
  cacheTextCardPreview,
  getCachedTextCardPreview,
} from "../../services/text-card-preview-cache";
import {
  initializeTextCardContent,
  TEXT_CARD_STORAGE_KEYS,
} from "../../utils/text-card-storage";
import {
  canvasToTempFilePath,
  createPreviewSignature,
  createRenderQueue,
  getTextCardCanvas,
  loadCanvasImage,
  type TextCardCanvasContext as Canvas2DContext,
  type TextCardCanvasNode as Canvas2DNode,
} from "../../utils/text-card-render";
import {
  createTextCardContentParser,
  type TextCardParagraph as Paragraph,
  type TextCardTextPart as TextPart,
} from "../../features/text-card/content";
import { createTimedUndo } from "../../features/text-card/timed-undo";

  type ActionKey = "paste" | "copy" | "edit" | "clear" | "export";
  type RenderQuality = "preview" | "export";
  type RenderProgress = (completed: number, total: number) => void;

  type CanvasMetrics = {
    width: number;
    height: number;
    scale: number;
  };

  type ClearSnapshot = {
    content: string;
    activeIndex: number;
  };

  type SyncContentOptions = {
    isExample?: boolean;
    persist?: boolean;
  };


  const STORAGE_KEY = TEXT_CARD_STORAGE_KEYS.douyin2;
  const LEGACY_STORAGE_KEY = "DOUYIN2_FORM_DATA_CONTENT";
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
  const {
    appendPastedContent,
    getContentSlides,
    getCopyableContent,
    getParagraphs,
  } = createTextCardContentParser({
    format: "bracketed",
    tags: DOUYIN_TAGS,
  });
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
  const enqueueRender = createRenderQueue();
  const clearUndo = createTimedUndo<ClearSnapshot>();

  Component({
    data: {
      ...createTextCardPageData(),
      pages: [] as Paragraph[][],
    },
    lifetimes: {
      attached() {
        const initialContent = initializeTextCardContent(
          "douyin2",
          LEGACY_STORAGE_KEY,
        );

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
        clearUndo.clear();
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
      prepareTemplateSwitch() {
        if (this.data.isGenerating) return false;
        this.finalizeClearUndo();
        return true;
      },

      handleCopyTemplate() {
        copyTextCardTemplate(COPY_TEMPLATE_CONTENT);
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
        openTextCardEditor("douyin2");
      },

      clearContent() {
        if (!this.data.hasCustomContent) return;

        clearUndo.start({
          content: this.data.content,
          activeIndex: this.data.activeIndex,
        }, () => this.finalizeClearUndo());
        this.syncContent("");
        this.setData({ showClearUndo: true });
      },

      handleUndoClear() {
        const snapshot = clearUndo.clear();
        if (!snapshot) return;
        this.setData({ showClearUndo: false });
        this.syncContent(snapshot.content, snapshot.activeIndex);
      },

      finalizeClearUndo() {
        clearUndo.clear();
        if (this.data.showClearUndo) {
          this.setData({ showClearUndo: false });
        }
      },

      async handlePasteContent() {
        const pastedContent = await readTextCardClipboard();
        if (!pastedContent) return;

        const currentContent = this.data.hasCustomContent ? this.data.content : "";
        const content = appendPastedContent(currentContent, pastedContent);
        if (!(await ensureTextCardContentSafe(pastedContent))) return;

        this.finalizeClearUndo();
        this.syncContent(content);
        wx.showToast({
          title: currentContent ? "已追加" : "已粘贴",
          icon: "success",
        });
      },

      handleCopyContent() {
        if (!this.data.hasCustomContent) return;

        const text = getCopyableContent(this.data.content);
        if (!text) return;

        copyTextCardContent(text);
      },

      async handleSaveImages() {
        if (this.data.isGenerating) return;
        if (!this.data.hasCustomContent) return;

        this.setData({ isGenerating: true });
        const total = this.data.pages.length;
        try {
          await saveTextCardImages(total, (onProgress) =>
            this.renderPagesToImages("export", undefined, onProgress),
          );
        } finally {
          this.setData({ isGenerating: false });
        }
      },

      async refreshRenderedImages() {
        if (!this.data.canvasReady || !this.data.pages.length) return;

        const requestId = ++renderRequestId;
        const previewSignature = createPreviewSignature(
          PREVIEW_CACHE_VERSION,
          this.data.content,
        );
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

        return canvasToTempFilePath(canvas, metrics.width, metrics.height);
      },

      getExportCanvas(): Promise<Canvas2DNode> {
        return getTextCardCanvas(this, CANVAS_ID);
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
          ? getCachedTextCardPreview(
              "douyin2",
              createPreviewSignature(PREVIEW_CACHE_VERSION, content),
            )
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

    },
  });

  function getPages(content: string) {
    return getContentSlides(content)
      .map((slide) => getParagraphs(slide))
      .filter((page) => page.some((paragraph) => !paragraph.isSpacer));
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

  function ensureDouyin2FontLoaded() {
    return loadAppFont(APP_FONTS.ui);
  }
