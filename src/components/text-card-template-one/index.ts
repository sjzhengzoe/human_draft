// Rendering and editing controller for text-card template one.
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
  appendPastedEntry,
  createPastedEntry,
  getContentSlides,
  getDouyinCopyableContent,
  getNextSlideOrder,
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


  const STORAGE_KEY = TEXT_CARD_STORAGE_KEYS.xiaohongshu;
  const LEGACY_STORAGE_KEY = "XIAOHONGSHU_FORM_DATA_CONTENT";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "xiaohongshuExportCanvas";
  const PREVIEW_CACHE_VERSION = "xiaohongshu-v5";
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
  const DEFAULT_CONTENT = `#感性的人类/WAIT
01
即使是不同的 AI
看完我的日记 都会知道
我是一个理性高效的人

这其实不错 但过于"偏科"
所以我过得还不错 但不太快乐

趁着假期 我重新审视我的日记
结合 AI 给我的建议
决定开始在小红书记录我的"文科"
在抖音继续保持我的"理科"分数

下一阶段目标："文理双全"

02
有些庆幸
前几天就开始训练小猫 听吹风机的声音
小猫也慢慢开始适应 不会像第一次那样
疯狂逃窜

所以在这天早晨 楼上钻洞机响起的时候
虽然慌不择路 但起码有了吹风机作为过渡
不会不得已 突然经受那么大的噪音
却毫无准备

这么想的话 我是不是也该庆幸
庆幸我现在遇到的各种小小磨难
也是在 未雨绸缪
让我不至于在未来某个瞬间 束手无策

03
由于我一直在拍我的小猫
而我的小猫又过于好看
于是我的小猫收到了一份来自商家的玩具
这是我的小猫自己挣的玩具呢

从未想过
原来能够以这种方式
获得某件物品
完成某个"交易"

这是我见到所有朋友
都要炫耀的一件事情
毕竟我的小猫
这么厉害`;
  const COPY_TEMPLATE_CONTENT = [
    "01",
    "这里填写第一张卡片的内容",
    "可以自由换行",
    "",
    "这里可以开始新的段落",
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
          "xiaohongshu",
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
        openTextCardEditor("xiaohongshu");
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
        const nextOrder = getNextSlideOrder(currentContent);
        const pastedEntry = createPastedEntry(pastedContent, nextOrder);
        if (!pastedEntry || !(await ensureTextCardContentSafe(pastedContent))) return;

        const nextContent = appendPastedEntry(currentContent, pastedEntry);
        const nextActiveIndex = Math.max(getContentSlides(nextContent).length - 1, 0);
        this.finalizeClearUndo();
        this.syncContent(nextContent, nextActiveIndex);
        wx.showToast({ title: `已追加 ${nextOrder}`, icon: "success" });
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
          cacheTextCardPreview("xiaohongshu", previewSignature, urls);
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
        const textBlockHeight = getCanvasTextBlockHeight(paragraphLines, metrics);
        if (textBlockHeight > metrics.height - metrics.safeY * 2) {
          throw new Error(`第 ${slideIndex + 1} 页内容过长，请精简后重试`);
        }
        const textTop = Math.max(
          metrics.safeY,
          Math.round((metrics.height - textBlockHeight) / 2),
        );

        ctx.fillText(slide.order, metrics.textX, textTop);

        let y = textTop + metrics.lineHeight + metrics.orderBodyGap;
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
          ctx.fillText(section.order, metrics.combinedPaddingLeft, y);
          y += layout.lineHeight + layout.orderBottomGap;

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
        const slides = content.trim() ? getContentSlides(content) : [];
        const previewCount = slides.length
          ? slides.length + COMBINED_FONT_OPTIONS.length
          : 0;
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(previewCount - 1, 0),
        );
        const cachedUrls = slides.length
          ? getCachedTextCardPreview(
              "xiaohongshu",
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
  ) {
    return buildCombinedLayout(slides, fontFamily, ctx, metrics);
  }

  function buildCombinedLayout(
    slides: Slide[],
    fontFamily: string,
    ctx: Canvas2DContext,
    metrics: CanvasMetrics,
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

      return (
        total +
        lineHeight +
        orderBottomGap +
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
  ) {
    const bodyHeight = paragraphLines.reduce((total, lines, index) => {
      const gap =
        index === paragraphLines.length - 1 ? 0 : metrics.paragraphGap;

      return total + lines.length * metrics.lineHeight + gap;
    }, 0);

    return metrics.lineHeight + metrics.orderBodyGap + bodyHeight;
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
    return loadAppFont(APP_FONTS.red3, { timeoutMs: 0 });
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
    let forceReload = false;
    while (!isCancelled()) {
      try {
        await loadAppFont(APP_FONTS.red3, { timeoutMs: 0, forceReload });
        if (await waitForRed3CanvasFont(canvas, fontSize, isCancelled)) {
          return true;
        }
      } catch {
        // Keep the page in its processing state while the background retry continues.
      }

      if (isCancelled()) return false;

      try {
        await loadAppFont(APP_FONTS.red3, {
          timeoutMs: 0,
          forceReload: true,
          usePersistentCache: false,
        });
        if (await waitForRed3CanvasFont(canvas, fontSize, isCancelled)) {
          return true;
        }
      } catch {
        // Retry the persistent download so a later launch can use the saved font.
      }

      forceReload = true;
      await delay(RED3_FONT_RETRY_DELAY);
    }

    return false;
  }
