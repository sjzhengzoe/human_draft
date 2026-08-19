// Rendering and editing controller for text-card template four.
import { APP_FONTS } from "../../config/fonts";
import { loadAppFont } from "../../services/font-loader";
import { TEXT_CARD_RENDER_COLORS } from "../../styles/colors";
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
  getContentSlides,
  getDouyinCopyableContent,
  getXiaohongshuCopyableContent,
  type XiaohongshuSlide as Slide,
  XIAOHONGSHU_BLANK_LINE,
} from "../../features/text-card/xiaohongshu-content";
import { createTimedUndo } from "../../features/text-card/timed-undo";

  type ActionKey =
    | "paste"
    | "append"
    | "copy"
    | "edit"
    | "clear"
    | "export";
  type CopyMode = "xiaohongshu" | "douyin";
  type RenderQuality = "preview" | "export";
  type RenderProgress = (completed: number, total: number) => void;
  type RenderImageReady = (urls: string[]) => Promise<void>;


  type CombinedFontOption = {
    family: string;
  };

  type CanvasMetrics = {
    width: number;
    height: number;
    textFont: string;
    textX: number;
    safeY: number;
    lineHeight: number;
    orderBodyGap: number;
    paragraphGap: number;
    textMaxWidth: number;
    combinedPaddingLeft: number;
    combinedPaddingRight: number;
    combinedSafeY: number;
    combinedFontSize: number;
    combinedOrderBottomGap: number;
    combinedSectionGap: number;
  };

  type CanvasTextLine = {
    text: string;
    justify: boolean;
  };

  type CombinedLayout = {
    sections: Array<{
      order: string;
      lines: CanvasTextLine[];
    }>;
    font: string;
    lineHeight: number;
    orderBottomGap: number;
    sectionGap: number;
    height: number;
  };

  type ClearSnapshot = {
    content: string;
    activeIndex: number;
  };

  type SyncContentOptions = {
    isExample?: boolean;
    persist?: boolean;
  };


  const STORAGE_KEY = TEXT_CARD_STORAGE_KEYS.xiaohongshu4;
  const LEGACY_STORAGE_KEY = "XIAOHONGSHU4_FORM_DATA_CONTENT";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "xiaohongshu4ExportCanvas";
  const PREVIEW_CACHE_VERSION = "xiaohongshu4-v1";
  const BASE_CANVAS_WIDTH = 1080;
  const BASE_CANVAS_HEIGHT = 1440;
  const PREVIEW_CANVAS_WIDTH = BASE_CANVAS_WIDTH;
  const EXPORT_CANVAS_WIDTH = 2880;
  const MAX_COMBINED_CANVAS_HEIGHT_RATIO = 16 / 9;
  const RED3_FONT_FAMILY = APP_FONTS.red3.family;
  const RED3_FONT_CHECK_INTERVAL = 120;
  const RED3_FONT_CHECK_TIMEOUT = 12000;
  const RED3_FONT_RETRY_DELAY = 3000;
  const RED3_FONT_CHECK_SAMPLES = [
    "WAIT 0123456789 ilMW",
    "珍惜浪费生命流动",
  ];
  const SECOND_THEME_BASE_WIDTH = 300;
  const COMBINED_FONT_OPTIONS: CombinedFontOption[] = [
    {
      family: RED3_FONT_FAMILY,
    },
  ];
  const DEFAULT_CONTENT = `第一张卡片标题
第一张正文可以从这里开始
按你希望的方式写

第二张卡片
这里可以继续写下一段内容

第三张卡片
你也可以继续追加更多内容`;
  const COPY_TEMPLATE_CONTENT = [
    "第一张卡片标题",
    "这里填写第一张卡片的内容",
    "可以自由换行",
    "",
    "第二张卡片标题",
    "这里填写第二张卡片的内容",
    "可以继续添加更多文字",
    "",
    "第三张卡片标题",
    "这里填写第三张卡片的内容",
  ].join("\n");
  const SHOW_SLIDE_ORDER = false;

function getBlankLineSeparatedContent(content: string) {
    const normalized = content.replace(/\r\n/g, "\n").trim();
    if (!normalized) return "";

    const blocks = normalized
      .split(/\n\s*\n+/)
      .map((block) =>
        block
          .split("\n")
          .map((line) => line.trimEnd())
          .filter((line) => {
            const trimmedLine = line.trim();
            return (
              trimmedLine !== "" &&
              !trimmedLine.startsWith("#") &&
              !/^\d{2}$/.test(trimmedLine)
            );
          })
          .join("\n")
          .trim(),
      )
      .filter(Boolean);

    return blocks
      .map(
        (block, index) =>
          `${String(index + 1).padStart(2, "0")}\n${block}`,
      )
      .join("\n\n");
  }

  function getTextCardSlides(content: string) {
    const parsedContent = getBlankLineSeparatedContent(content);
    return parsedContent ? getContentSlides(parsedContent) : [];
  }
    "",
    "02",
    "这里填写第二张卡片的内容",
    "可以继续添加更多文字",
    "",
    "03",
    "这里填写第三张卡片的内容",
  ].join("\n");

  let renderRequestId = 0;
  const enqueueRender = createRenderQueue();
  const clearUndo = createTimedUndo<ClearSnapshot>();
  const previewImageWaiters = new Map<string, () => void>();

  Component({
    data: {
      ...createTextCardPageData(),
      slides: [] as Slide[],
      previewCount: 0,
    },
    lifetimes: {
      attached() {
        const initialContent = initializeTextCardContent(
          "xiaohongshu4",
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
        this.loadRed3Font();
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
        releasePreviewImageWaiters();
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

      loadRed3Font() {
        ensureRed3FontLoaded()
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
            console.error("加载 red3 字体失败", error);
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

        if (key === "append") {
          this.handleAppendContent();
          return;
        }

        if (key === "copy") {
          this.openCopyModePicker();
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
        openTextCardEditor("xiaohongshu4");
      },

      async handlePasteContent() {
        const content = await readTextCardClipboard();
        if (!content || !(await ensureTextCardContentSafe(content))) return;

        this.finalizeClearUndo();
        this.syncContent(content);
        wx.showToast({ title: "已粘贴", icon: "success" });
      },

      async handleAppendContent() {
        const pastedContent = await readTextCardClipboard();
        if (!pastedContent) return;

        const currentContent = this.data.hasCustomContent ? this.data.content : "";
        const trimmedPastedContent = pastedContent.trim();
        if (!trimmedPastedContent || !(await ensureTextCardContentSafe(pastedContent))) return;

        const nextContent = currentContent
          ? `${currentContent}\n\n${trimmedPastedContent}`
          : trimmedPastedContent;
        const nextActiveIndex = Math.max(
          getTextCardSlides(nextContent).length - 1,
          0,
        );
        this.finalizeClearUndo();
        this.syncContent(nextContent, nextActiveIndex);
        wx.showToast({ title: "已追加", icon: "success" });
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

      openCopyModePicker() {
        if (!this.data.hasCustomContent) return;
        wx.showActionSheet({
          itemList: ["复制小红书", "复制抖音版"],
          success: (result) => {
            this.handleCopyContent(
              result.tapIndex === 0 ? "xiaohongshu" : "douyin",
            );
          },
        });
      },

      handleCopyContent(mode: CopyMode) {
        const text =
          mode === "xiaohongshu"
            ? getXiaohongshuCopyableContent(this.data.content)
            : getDouyinCopyableContent(this.data.content);

        if (!text) return;

        copyTextCardContent(text);
      },

      async handleSaveImages() {
        if (this.data.isGenerating) return;
        if (!this.data.hasCustomContent) return;

        this.setData({ isGenerating: true });
        const total = this.data.slides.length + COMBINED_FONT_OPTIONS.length;
        try {
          await saveTextCardImages(total, (onProgress) =>
            this.generateExportImages(onProgress),
          );
        } finally {
          this.setData({ isGenerating: false });
        }
      },

      async refreshRenderedImages() {
        if (!this.data.canvasReady || !this.data.slides.length) return;

        const requestId = ++renderRequestId;
        const previewSignature = createPreviewSignature(
          PREVIEW_CACHE_VERSION,
          this.data.content,
        );
        this.setData({
          isRenderingCards: true,
          renderError: false,
          renderErrorMessage: "生成失败，请重试",
          renderProgressText: "",
          renderedImageUrls: [],
          activeIndex: 0,
        });

        try {
          const urls = await this.renderSlidesToImages(
            requestId,
            (readyUrls) => this.publishPreviewImages(requestId, readyUrls),
          );
          if (requestId !== renderRequestId) return;

          this.setData({
            renderedImageUrls: urls,
            renderError: false,
          });
          cacheTextCardPreview("xiaohongshu4", previewSignature, urls);
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

      publishPreviewImages(
        requestId: number,
        readyUrls: string[],
      ): Promise<void> {
        const latestUrl = readyUrls[readyUrls.length - 1];
        if (!latestUrl || requestId !== renderRequestId) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            previewImageWaiters.delete(latestUrl);
            resolve();
          };
          const timeoutId = setTimeout(finish, 1200);
          previewImageWaiters.set(latestUrl, finish);
          this.setData({
            renderedImageUrls: readyUrls,
            renderProgressText: `${readyUrls.length}/${this.data.previewCount}`,
          });
        });
      },

      handlePreviewImageLoad(
        event: WechatMiniprogram.CustomEvent<{ url?: string }>,
      ) {
        const url = String(event.detail.url || "");
        const finish = previewImageWaiters.get(url);
        if (finish) {
          wx.nextTick(() => {
            setTimeout(finish, 32);
          });
        }
      },

      renderSlidesToImages(
        requestId: number,
        onImageReady?: RenderImageReady,
      ): Promise<string[]> {
        return this.generateImages(
          "preview",
          requestId,
          undefined,
          onImageReady,
        );
      },

      generateExportImages(onProgress?: RenderProgress): Promise<string[]> {
        return this.generateImages("export", undefined, onProgress);
      },

      generateImages(
        quality: RenderQuality,
        previewRequestId?: number,
        onProgress?: RenderProgress,
        onImageReady?: RenderImageReady,
      ): Promise<string[]> {
        const slides = this.data.slides;
        const metrics = createCanvasMetrics(quality);
        const isStalePreview = () =>
          quality === "preview" && previewRequestId !== renderRequestId;
        const total = slides.length + COMBINED_FONT_OPTIONS.length;

        return enqueueRender(async () => {
          if (isStalePreview()) return [];

          const urls: string[] = [];

          if (!slides.length || isStalePreview()) return urls;

          const canvas = await this.getExportCanvas();
          const fontReady = await ensureRed3CanvasFont(
            canvas,
            metrics.combinedFontSize,
            isStalePreview,
          );
          if (!fontReady || isStalePreview()) return [];
          const backgroundImage = await loadCanvasImage(canvas, BACKGROUND_IMAGE);

          for (const [index, slide] of slides.entries()) {
            if (isStalePreview()) return [];
            urls.push(
              await this.generateSlideImage(
                slide,
                index,
                canvas,
                backgroundImage,
                metrics,
              ),
            );
            if (onImageReady) await onImageReady([...urls]);
            onProgress?.(urls.length, total);
          }

          for (const fontOption of COMBINED_FONT_OPTIONS) {
            if (isStalePreview()) return [];
            urls.push(
              await this.generateCombinedImage(
                slides,
                fontOption.family,
                canvas,
                backgroundImage,
                metrics,
              ),
            );
            if (onImageReady) await onImageReady([...urls]);
            onProgress?.(urls.length, total);
          }

          return urls;
        });
      },

      async generateSlideImage(
        slide: Slide,
        slideIndex: number,
        canvas: Canvas2DNode,
        backgroundImage: unknown,
        metrics: CanvasMetrics,
      ): Promise<string> {
        const ctx = canvas.getContext("2d");

        canvas.width = metrics.width;
        canvas.height = metrics.height;

        ctx.clearRect(0, 0, metrics.width, metrics.height);
        ctx.drawImage(backgroundImage, 0, 0, metrics.width, metrics.height);
        ctx.fillStyle = TEXT_CARD_RENDER_COLORS.texture;
        ctx.fillRect(0, 0, metrics.width, metrics.height);
        ctx.fillStyle = TEXT_CARD_RENDER_COLORS.ink;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = metrics.textFont;

        const paragraphLines = slide.paragraphs.map((paragraph) =>
          paragraph
            .split("\n")
            .flatMap((line) => wrapLine(line, ctx, metrics.textMaxWidth)),
        );
        const textBlockHeight = getCanvasTextBlockHeight(
          paragraphLines,
          metrics,
          SHOW_SLIDE_ORDER,
        );
        if (textBlockHeight > metrics.height - metrics.safeY * 2) {
          throw new Error(`第 ${slideIndex + 1} 页内容过长，请精简后重试`);
        }
        const textTop = Math.max(
          metrics.safeY,
          Math.round((metrics.height - textBlockHeight) / 2),
        );

        if (SHOW_SLIDE_ORDER) {
          ctx.fillText(slide.order, metrics.textX, textTop);
        }

        let y = SHOW_SLIDE_ORDER
          ? textTop + metrics.lineHeight + metrics.orderBodyGap
          : textTop;
        paragraphLines.forEach((lines) => {
          lines.forEach((line) => {
            if (y <= metrics.height - metrics.safeY) {
              drawCanvasTextLine(
                ctx,
                line,
                metrics.textX,
                y,
                metrics.textMaxWidth,
              );
            }
            y += metrics.lineHeight;
          });

          y += metrics.paragraphGap;
        });

        return canvasToTempFilePath(canvas, metrics.width, metrics.height);
      },

      async generateCombinedImage(
        slides: Slide[],
        fontFamily: string,
        canvas: Canvas2DNode,
        backgroundImage: unknown,
        metrics: CanvasMetrics,
      ): Promise<string> {
        canvas.width = metrics.width;
        canvas.height = metrics.height;

        const measurementContext = canvas.getContext("2d");
        const layout = createCombinedLayout(
          slides,
          fontFamily,
          measurementContext,
          metrics,
          SHOW_SLIDE_ORDER,
        );
        const requiredCanvasHeight =
          layout.height + metrics.combinedSafeY * 2;
        const maxCanvasHeight = Math.round(
          metrics.width * MAX_COMBINED_CANVAS_HEIGHT_RATIO,
        );
        const canvasHeight = Math.min(
          Math.max(metrics.height, requiredCanvasHeight),
          maxCanvasHeight,
        );

        canvas.width = metrics.width;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, metrics.width, canvasHeight);
        ctx.drawImage(backgroundImage, 0, 0, metrics.width, canvasHeight);
        ctx.fillStyle = TEXT_CARD_RENDER_COLORS.texture;
        ctx.fillRect(0, 0, metrics.width, canvasHeight);
        ctx.fillStyle = TEXT_CARD_RENDER_COLORS.black;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = layout.font;
        const textTop = Math.max(
          metrics.combinedSafeY,
          Math.round((canvasHeight - layout.height) / 2),
        );
        let y = textTop;

        layout.sections.forEach((section, index) => {
          if (SHOW_SLIDE_ORDER) {
            ctx.fillText(section.order, metrics.combinedPaddingLeft, y);
            y += layout.lineHeight + layout.orderBottomGap;
          }

          section.lines.forEach((line) => {
            drawCanvasTextLine(
              ctx,
              line,
              metrics.combinedPaddingLeft,
              y,
              metrics.width -
                metrics.combinedPaddingLeft -
                metrics.combinedPaddingRight,
            );
            y += layout.lineHeight;
          });

          if (index < layout.sections.length - 1) {
            y += layout.sectionGap;
          }
        });

        return canvasToTempFilePath(canvas, metrics.width, canvasHeight);
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
        const slides = content.trim() ? getTextCardSlides(content) : [];
        const previewCount = slides.length
          ? slides.length + COMBINED_FONT_OPTIONS.length
          : 0;
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(previewCount - 1, 0),
        );
        const cachedUrls = slides.length
          ? getCachedTextCardPreview(
              "xiaohongshu4",
              createPreviewSignature(PREVIEW_CACHE_VERSION, content),
            )
          : undefined;
        const renderedImageUrls = cachedUrls || [];
        renderRequestId += 1;
        releasePreviewImageWaiters();

        this.setData(
          {
            content,
            hasCustomContent,
            isExampleContent,
            slides,
            renderedImageUrls,
            isRenderingCards: false,
            renderError: false,
            renderErrorMessage: "生成失败，请重试",
            renderProgressText: "",
            previewCount,
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


  function getRenderErrorMessage(error: unknown) {
    if (
      error instanceof Error &&
      /^第 \d+ 页内容过长/.test(error.message)
    ) {
      return error.message;
    }
    return "生成失败，请重试";
  }


  function releasePreviewImageWaiters() {
    for (const finish of previewImageWaiters.values()) finish();
    previewImageWaiters.clear();
  }


  function wrapLine(
    line: string,
    ctx: Canvas2DContext,
    maxWidth: number,
  ) {
    const result: CanvasTextLine[] = [];
    let current = "";
    let currentWidth = 0;

    Array.from(line).forEach((char) => {
      const charWidth = ctx.measureText(char).width;

      if (current && currentWidth + charWidth > maxWidth) {
        result.push({ text: current, justify: true });
        current = char;
        currentWidth = charWidth;
      } else {
        current += char;
        currentWidth += charWidth;
      }
    });

    if (current) {
      result.push({ text: current, justify: false });
    }

    return result.length ? result : [{ text: line, justify: false }];
  }

  function drawCanvasTextLine(
    ctx: Canvas2DContext,
    line: CanvasTextLine,
    x: number,
    y: number,
    maxWidth: number,
  ) {
    const characters = Array.from(line.text);
    if (!line.justify || characters.length < 2) {
      ctx.fillText(line.text, x, y);
      return;
    }

    const naturalWidth = characters.reduce(
      (total, character) => total + ctx.measureText(character).width,
      0,
    );
    const letterSpacing = Math.max(
      0,
      (maxWidth - naturalWidth) / (characters.length - 1),
    );
    let currentX = x;

    characters.forEach((character, index) => {
      ctx.fillText(character, currentX, y);
      currentX += ctx.measureText(character).width;
      if (index < characters.length - 1) {
        currentX += letterSpacing;
      }
    });
  }

  function createCombinedLayout(
    slides: Slide[],
    fontFamily: string,
    ctx: Canvas2DContext,
    metrics: CanvasMetrics,
    showOrder = true,
  ) {
    return buildCombinedLayout(slides, fontFamily, ctx, metrics, showOrder);
  }

  function buildCombinedLayout(
    slides: Slide[],
    fontFamily: string,
    ctx: Canvas2DContext,
    metrics: CanvasMetrics,
    showOrder: boolean,
  ): CombinedLayout {
    const lineHeight = metrics.lineHeight;
    const orderBottomGap = metrics.combinedOrderBottomGap;
    const sectionGap = metrics.combinedSectionGap;
    const maxTextWidth =
      metrics.width -
      metrics.combinedPaddingLeft -
      metrics.combinedPaddingRight;
    const font = `normal ${metrics.combinedFontSize}px "${fontFamily}"`;
    ctx.font = font;
    const sections = slides.map((slide) => {
      const body = getCombinedBody(slide.paragraphs);

      return {
        order: slide.order,
        lines: wrapCombinedText(body, maxTextWidth, ctx),
      };
    });
    const height = sections.reduce((total, section, index) => {
      const gap = index < sections.length - 1 ? sectionGap : 0;
      const orderHeight = showOrder ? lineHeight + orderBottomGap : 0;

      return (
        total +
        orderHeight +
        section.lines.length * lineHeight +
        gap
      );
    }, 0);

    return {
      sections,
      font,
      lineHeight,
      orderBottomGap,
      sectionGap,
      height,
    };
  }

  function getCombinedBody(paragraphs: string[]) {
    const tokens: string[] = [];
    const pushSeparator = () => {
      if (tokens[tokens.length - 1] !== "/") {
        tokens.push("/");
      }
    };

    paragraphs.forEach((paragraph, paragraphIndex) => {
      if (paragraphIndex > 0) {
        pushSeparator();
      }

      paragraph.split("\n").forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        if (trimmedLine === XIAOHONGSHU_BLANK_LINE) {
          pushSeparator();
          return;
        }

        const normalizedLine = trimmedLine
          .replace(/\u2800+/g, " / ")
          .replace(/\s+/g, " ")
          .trim();

        if (!normalizedLine) return;
        if (normalizedLine === "/") {
          pushSeparator();
          return;
        }

        tokens.push(normalizedLine);
      });
    });

    while (tokens[tokens.length - 1] === "/") {
      tokens.pop();
    }

    return tokens.join(" ").replace(/\s+/g, " ").trim();
  }

  function wrapCombinedText(
    text: string,
    maxWidth: number,
    ctx: Canvas2DContext,
  ) {
    if (!text) return [];

    const lines: CanvasTextLine[] = [];
    let currentLine = "";
    let currentWidth = 0;

    Array.from(text).forEach((char) => {
      const charWidth = ctx.measureText(char).width;

      if (currentLine && currentWidth + charWidth > maxWidth) {
        lines.push({ text: currentLine.trimEnd(), justify: true });
        currentLine = char.trimStart();
        currentWidth = currentLine ? charWidth : 0;
        return;
      }

      currentLine += char;
      currentWidth += charWidth;
    });

    if (currentLine) {
      lines.push({ text: currentLine.trimEnd(), justify: false });
    }

    return lines;
  }

  function getCanvasTextBlockHeight(
    paragraphLines: CanvasTextLine[][],
    metrics: CanvasMetrics,
    showOrder: boolean,
  ) {
    const bodyHeight = paragraphLines.reduce((total, lines, index) => {
      const gap =
        index === paragraphLines.length - 1 ? 0 : metrics.paragraphGap;

      return total + lines.length * metrics.lineHeight + gap;
    }, 0);

    return bodyHeight + (showOrder ? metrics.lineHeight + metrics.orderBodyGap : 0);
  }

  function createCanvasMetrics(quality: RenderQuality): CanvasMetrics {
    const width =
      quality === "preview" ? PREVIEW_CANVAS_WIDTH : EXPORT_CANVAS_WIDTH;
    const canvasScale = width / BASE_CANVAS_WIDTH;
    const secondThemeScale = width / SECOND_THEME_BASE_WIDTH;
    const scaleCanvasValue = (value: number) =>
      Math.round(value * canvasScale);
    const scaleSecondThemeValue = (value: number) =>
      Math.round(value * secondThemeScale);
    const height = Math.round(BASE_CANVAS_HEIGHT * canvasScale);
    const textX = scaleCanvasValue(80);
    const lineHeight = scaleCanvasValue(62);
    const combinedFontSize = scaleCanvasValue(40);

    return {
      width,
      height,
      textFont: `normal ${combinedFontSize}px "${RED3_FONT_FAMILY}"`,
      textX,
      safeY: scaleCanvasValue(100),
      lineHeight,
      orderBodyGap: scaleCanvasValue(54),
      paragraphGap: scaleCanvasValue(32),
      textMaxWidth: width - textX * 2,
      combinedPaddingLeft: scaleSecondThemeValue(22),
      combinedPaddingRight: scaleSecondThemeValue(49),
      combinedSafeY: scaleSecondThemeValue(38),
      combinedFontSize,
      combinedOrderBottomGap: scaleSecondThemeValue(3),
      combinedSectionGap: lineHeight,
    };
  }

  function ensureRed3FontLoaded() {
    return loadAppFont(APP_FONTS.red3);
  }

  function delay(duration: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, duration));
  }

  function readCanvasFontSignature(
    ctx: Canvas2DContext,
    fontFamily: string,
    fontSize: number,
  ) {
    ctx.font = `normal ${fontSize}px "${fontFamily}"`;
    return RED3_FONT_CHECK_SAMPLES.map(
      (sample) => ctx.measureText(sample).width,
    );
  }

  function isRed3CanvasFontAvailable(
    canvas: Canvas2DNode,
    fontSize: number,
  ) {
    const ctx = canvas.getContext("2d");
    const red3Signature = readCanvasFontSignature(
      ctx,
      RED3_FONT_FAMILY,
      fontSize,
    );
    const missingFontSignature = readCanvasFontSignature(
      ctx,
      "__HumanDraftMissingFont__",
      fontSize,
    );

    return red3Signature.some(
      (width, index) => Math.abs(width - missingFontSignature[index]) > 0.5,
    );
  }

  async function waitForRed3CanvasFont(
    canvas: Canvas2DNode,
    fontSize: number,
    isCancelled: () => boolean,
  ) {
    const expiresAt = Date.now() + RED3_FONT_CHECK_TIMEOUT;
    while (Date.now() < expiresAt && !isCancelled()) {
      if (isRed3CanvasFontAvailable(canvas, fontSize)) return true;
      await delay(RED3_FONT_CHECK_INTERVAL);
    }
    return false;
  }

  async function ensureRed3CanvasFont(
    canvas: Canvas2DNode,
    fontSize: number,
    isCancelled: () => boolean,
  ) {
    while (!isCancelled()) {
      try {
        await loadAppFont(APP_FONTS.red3);
        if (isRed3CanvasFontAvailable(canvas, fontSize)) return true;

        if (await waitForRed3CanvasFont(canvas, fontSize, isCancelled)) {
          return true;
        }
      } catch {
        // Keep the page in its processing state while the background retry continues.
      }

      if (isCancelled()) return false;
      await delay(RED3_FONT_RETRY_DELAY);
    }

    return false;
  }
