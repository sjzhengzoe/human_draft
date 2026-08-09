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
import { createLocalImageBindingsStore } from "../../features/text-card/local-image-bindings";
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
  type TextCardCanvasImage as CanvasImage,
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
    scale: number;
  };

  type ClearSnapshot = {
    content: string;
    activeIndex: number;
    imagePaths: string[];
  };

  type SyncContentOptions = {
    isExample?: boolean;
    persist?: boolean;
    preferredImagePaths?: string[];
  };

  const STORAGE_KEY = TEXT_CARD_STORAGE_KEYS.douyin3;
  const LEGACY_STORAGE_KEY = "DOUYIN3_FORM_DATA_CONTENT";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "douyin3ExportCanvas";
  const PREVIEW_CACHE_VERSION = "douyin3-v2";
  const BASE_CANVAS_WIDTH = 300;
  const CANVAS_WIDTH = 2160;
  const PREVIEW_CANVAS_WIDTH = 1080;
  const CANVAS_SCALE = CANVAS_WIDTH / BASE_CANVAS_WIDTH;
  const TEMPLATE_ONE_FONT_SIZE = (40 / 1080) * BASE_CANVAS_WIDTH;
  const TEMPLATE_THREE_LINE_HEIGHT = (68 / 1080) * BASE_CANVAS_WIDTH;
  const CANVAS_PADDING_LEFT = scaleCanvasValue(22 + TEMPLATE_ONE_FONT_SIZE);
  const CANVAS_TEXT_MAX_WIDTH = CANVAS_WIDTH - CANVAS_PADDING_LEFT * 2;
  const CANVAS_SAFE_Y = scaleCanvasValue(38);
  const CANVAS_BODY_FONT_SIZE = scaleCanvasValue(TEMPLATE_ONE_FONT_SIZE);
  const CANVAS_TITLE_FONT_SIZE = CANVAS_BODY_FONT_SIZE;
  const CANVAS_LETTER_SPACING = CANVAS_BODY_FONT_SIZE * 0.0025;
  const CANVAS_BODY_LINE_HEIGHT = scaleCanvasValue(TEMPLATE_THREE_LINE_HEIGHT);
  const CANVAS_TITLE_LINE_HEIGHT = CANVAS_BODY_LINE_HEIGHT;
  const CANVAS_SPACER_HEIGHT = scaleCanvasValue(13);
  const CANVAS_TITLE_BOTTOM_GAP = scaleCanvasValue(9);
  const CANVAS_TITLE_NEXT_GAP = scaleCanvasValue(20);
  const CANVAS_TITLE_EXTRA_LINE_GAP = CANVAS_BODY_LINE_HEIGHT;
  const CANVAS_TEXT_TOP = scaleCanvasValue(238) - CANVAS_BODY_LINE_HEIGHT;
  const CANVAS_BOTTOM_SAFE = scaleCanvasValue(44);
  const CIRCLE_IMAGE_SIZE = scaleCanvasValue(140);
  const CIRCLE_IMAGE_TOP = scaleCanvasValue(44);
  const DOUYIN3_FONT_FAMILY = APP_FONTS.lantingExtraLight.family;
  const CANVAS_TEXT_FONT_FAMILY = `"${DOUYIN3_FONT_FAMILY}", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
  const CANVAS_BODY_FONT = `normal ${CANVAS_BODY_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_TITLE_FONT = `bold ${CANVAS_TITLE_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const DOUYIN_TAGS = "#文字的力量 #记录真实生活 #思考 #讨论";
  const {
    appendPastedContent,
    getContentSlides,
    getCopyableContent,
    getParagraphs,
    normalizeText,
  } = createTextCardContentParser({
    format: "numbered",
    tags: DOUYIN_TAGS,
  });
  const {
    getStoredImagePaths,
    persistLocalImagePaths,
    removeLocalImageFile,
    saveLocalImageFile,
  } = createLocalImageBindingsStore("DOUYIN3_LOCAL_IMAGE_PATHS");
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
    "01",
    "这里填写第一张卡片的内容",
    "头像可以在卡片中单独选择",
    "",
    "02",
    "这里填写第二张卡片的内容",
    "",
    "03",
    "这里填写第三张卡片的内容",
  ].join("\n");

  let renderRequestId = 0;
  const enqueueRender = createRenderQueue();
  const clearUndo = createTimedUndo<ClearSnapshot>();

  Component({
    data: {
      ...createTextCardPageData(),
      pages: [] as Paragraph[][],
      selectedImagePaths: [] as string[],
      pageKeys: [] as string[],
      selectingImage: false,
      selectingImageIndex: -1,
      showCropModal: false,
      cropSourcePath: "",
      cropTargetIndex: -1,
    },
    lifetimes: {
      attached() {
        const initialContent = initializeTextCardContent(
          "douyin3",
          LEGACY_STORAGE_KEY,
        );

        if (typeof initialContent === "string") {
          const pageKeys = createPageKeys(
            getContentSlides(initialContent).filter((source) =>
              getParagraphs(source).some((paragraph) => !paragraph.isSpacer),
            ),
          );
          this.syncContent(initialContent, 0, {
            preferredImagePaths: getStoredImagePaths(pageKeys),
          });
        } else {
          this.syncContent(DEFAULT_CONTENT, 0, {
            isExample: true,
            persist: false,
          });
        }
        this.loadDouyin3Font();
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
        const snapshot = clearUndo.clear();
        if (snapshot) {
          snapshot.imagePaths.filter(Boolean).forEach(removeLocalImageFile);
        }
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
        if (this.data.isGenerating || this.data.selectingImage) return false;
        this.finalizeClearUndo();
        return true;
      },

      handleCopyTemplate() {
        copyTextCardTemplate(COPY_TEMPLATE_CONTENT);
      },

      loadDouyin3Font() {
        ensureDouyin3FontLoaded()
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
            console.warn("加载模板三方正兰亭黑 ExtraLight 失败，使用系统字体回退", error);
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

      handleChooseCircleImage(
        event: WechatMiniprogram.CustomEvent<{ index?: number }>,
      ) {
        if (this.data.selectingImage || this.data.isGenerating) return;

        const targetIndex = Number(event.detail.index);
        if (!Number.isInteger(targetIndex) || targetIndex < 0) return;

        this.setData({
          selectingImage: true,
          selectingImageIndex: targetIndex,
        });
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: (result) => {
            const imagePath = result.tempFiles[0]?.tempFilePath;
            if (!imagePath) {
              this.setData({
                selectingImage: false,
                selectingImageIndex: -1,
              });
              return;
            }

            this.setData({
              selectingImage: false,
              selectingImageIndex: -1,
              showCropModal: true,
              cropSourcePath: imagePath,
              cropTargetIndex: targetIndex,
            });
          },
          fail: () => {
            this.setData({
              selectingImage: false,
              selectingImageIndex: -1,
            });
          },
        });
      },

      handleCropCancel() {
        this.setData({
          showCropModal: false,
          cropSourcePath: "",
          cropTargetIndex: -1,
        });
      },

      async handleCropConfirm(
        event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>,
      ) {
        const tempFilePath = event.detail.tempFilePath;
        const targetIndex = this.data.cropTargetIndex;
        if (!tempFilePath || targetIndex < 0) return;

        try {
          const savedFilePath = await saveLocalImageFile(tempFilePath);
          const selectedImagePaths = [...this.data.selectedImagePaths];
          const previousFilePath = selectedImagePaths[targetIndex] || "";
          selectedImagePaths[targetIndex] = savedFilePath;
          persistLocalImagePaths(selectedImagePaths, this.data.pageKeys);
          this.setData({
            selectedImagePaths,
            showCropModal: false,
            cropSourcePath: "",
            cropTargetIndex: -1,
          });

          if (previousFilePath && previousFilePath !== savedFilePath) {
            removeLocalImageFile(previousFilePath);
          }
        } catch (error) {
          console.error("保存本地裁剪图片失败", error);
          wx.showToast({
            title: "图片本地保存失败，请重试",
            icon: "none",
          });
        }
      },

      handleCropError(
        event: WechatMiniprogram.CustomEvent<{ message?: string }>,
      ) {
        wx.showToast({
          title: event.detail.message || "图片裁剪失败，请重试",
          icon: "none",
        });
      },

      openEditModal() {
        openTextCardEditor("douyin3");
      },

      clearContent() {
        if (!this.data.hasCustomContent) return;

        clearUndo.start({
          content: this.data.content,
          activeIndex: this.data.activeIndex,
          imagePaths: [...this.data.selectedImagePaths],
        }, () => this.finalizeClearUndo());
        this.syncContent("");
        this.setData({ showClearUndo: true });
      },

      handleUndoClear() {
        const snapshot = clearUndo.clear();
        if (!snapshot) return;
        this.setData({ showClearUndo: false });
        this.syncContent(snapshot.content, snapshot.activeIndex, {
          preferredImagePaths: snapshot.imagePaths,
        });
      },

      finalizeClearUndo(removeImages = true) {
        const snapshot = clearUndo.clear();

        if (removeImages && snapshot) {
          const activePaths = new Set(this.data.selectedImagePaths.filter(Boolean));
          snapshot.imagePaths
            .filter((path) => path && !activePaths.has(path))
            .forEach(removeLocalImageFile);
        }

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
            this.renderPagesToImages(
              "export",
              this.data.selectedImagePaths,
              undefined,
              onProgress,
            ),
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
            [],
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
          cacheTextCardPreview("douyin3", previewSignature, urls);
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
        circleImagePaths: string[] = [],
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
            await ensureDouyin3FontLoaded();
          } catch (error) {
            console.warn("模板三方正兰亭黑 ExtraLight 不可用，使用系统字体回退", error);
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
                circleImagePaths[index] || "",
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
        circleImagePath = "",
        canvas: Canvas2DNode,
        backgroundImage: CanvasImage,
        metrics: CanvasMetrics,
      ): Promise<string> {
        const ctx = canvas.getContext("2d");
        const circleImage = circleImagePath
          ? await loadCanvasImage(canvas, circleImagePath)
          : undefined;
        canvas.width = metrics.width;
        canvas.height = Math.ceil(
          Math.max(CANVAS_TITLE_LINE_HEIGHT, CANVAS_BODY_LINE_HEIGHT) *
            2 *
            metrics.scale,
        );
        ctx.scale(metrics.scale, metrics.scale);
        const layout = createPageLayout(page, ctx);
        const canvasHeight = getCanvasHeight(layout);
        const outputHeight = Math.ceil(canvasHeight * metrics.scale);

        canvas.width = metrics.width;
        canvas.height = outputHeight;
        ctx.scale(metrics.scale, metrics.scale);

        ctx.clearRect(0, 0, CANVAS_WIDTH, canvasHeight);
        ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, canvasHeight);
        ctx.fillStyle = "rgba(255, 251, 240, 0.26)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);
        ctx.fillStyle = "#000000";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        let y = Math.max(CANVAS_SAFE_Y, CANVAS_TEXT_TOP);

        layout.forEach((item) => {
          if (item.type === "spacer") {
            y += item.height;
            return;
          }

          item.lines.forEach((line) => {
            drawPartsLine(ctx, line, CANVAS_PADDING_LEFT, y, item);
            y += item.lineHeight;
          });

          y += item.afterGap;
        });

        if (circleImage) {
          drawCircleImage(ctx, circleImage);
        }

        return canvasToTempFilePath(canvas, metrics.width, outputHeight);
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
        const pageEntries = (content.trim() ? getContentSlides(content) : [])
          .map((source) => ({ source, page: getParagraphs(source) }))
          .filter((entry) =>
            entry.page.some((paragraph) => !paragraph.isSpacer),
          );
        const pages = pageEntries.map((entry) => entry.page);
        const pageKeys = createPageKeys(
          pageEntries.map((entry) => entry.source),
        );
        const previousBindings = new Map(
          this.data.pageKeys.map((pageKey, index) => [
            pageKey,
            this.data.selectedImagePaths[index] || "",
          ]),
        );
        const nextPageKeySet = new Set(pageKeys);
        const selectedImagePaths = pages.map((_, index) => {
          if (options.preferredImagePaths) {
            return options.preferredImagePaths[index] || "";
          }

          const matchedPath = previousBindings.get(pageKeys[index]);
          if (matchedPath) return matchedPath;

          const previousPageKey = this.data.pageKeys[index];
          const canKeepEditedPageImage =
            pages.length === this.data.pageKeys.length &&
            previousPageKey &&
            !nextPageKeySet.has(previousPageKey);
          return canKeepEditedPageImage
            ? this.data.selectedImagePaths[index] || ""
            : "";
        });
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(pages.length - 1, 0),
        );
        const cachedUrls = pages.length
          ? getCachedTextCardPreview(
              "douyin3",
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
            pageKeys,
            selectedImagePaths,
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
          persistLocalImagePaths(selectedImagePaths, pageKeys);
        }
      },

    },
  });

  function createPageKeys(slides: string[]) {
    const occurrences = new Map<string, number>();

    return slides.map((slide, index) => {
      const lines = normalizeText(slide)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const firstLine = lines[0] || `页面 ${index + 1}`;
      const identity = /^\d{2}$/.test(firstLine)
        ? lines[1] || firstLine
        : firstLine.startsWith("［")
          ? `${firstLine}|${lines[1] || ""}`
          : firstLine;
      const normalizedIdentity = identity.replace(/\s+/g, " ").slice(0, 120);
      const occurrence = (occurrences.get(normalizedIdentity) || 0) + 1;
      occurrences.set(normalizedIdentity, occurrence);
      return `${normalizedIdentity}::${occurrence}`;
    });
  }

  function getRenderErrorMessage(_error: unknown) {
    return "生成失败，请重试";
  }

  type LayoutLine = {
    parts: TextPart[];
    justify: boolean;
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

  function createPageLayout(
    page: Paragraph[],
    ctx: Canvas2DContext,
  ): LayoutItem[] {
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
        CANVAS_TEXT_MAX_WIDTH,
        ctx,
        paragraph.isTitle,
      );

      layout.push({
        type: "text",
        lines,
        font: paragraph.isTitle ? CANVAS_TITLE_FONT : CANVAS_BODY_FONT,
        lineHeight: paragraph.isTitle
          ? CANVAS_TITLE_LINE_HEIGHT
          : CANVAS_BODY_LINE_HEIGHT,
        afterGap: paragraph.isTitle
          ? (isNextSpacer
              ? CANVAS_TITLE_NEXT_GAP
              : CANVAS_TITLE_BOTTOM_GAP) + CANVAS_TITLE_EXTRA_LINE_GAP
          : 0,
        isTitle: paragraph.isTitle,
      });
    });

    return layout;
  }

  function wrapParts(
    parts: TextPart[],
    maxWidth: number,
    ctx: Canvas2DContext,
    isTitle: boolean,
  ): LayoutLine[] {
    const lines: LayoutLine[] = [];
    let currentParts: TextPart[] = [];
    let currentWidth = 0;
    let currentCharacterCount = 0;

    parts.forEach((part) => {
      Array.from(part.text).forEach((char) => {
        ctx.font = isTitle ? CANVAS_TITLE_FONT : CANVAS_BODY_FONT;
        const charWidth = ctx.measureText(char).width;
        const spacing = currentCharacterCount ? CANVAS_LETTER_SPACING : 0;

        if (
          currentParts.length &&
          currentWidth + spacing + charWidth > maxWidth
        ) {
          lines.push({ parts: currentParts, justify: true });
          currentParts = [];
          currentWidth = 0;
          currentCharacterCount = 0;
        }

        const lastPart = currentParts[currentParts.length - 1];
        if (lastPart) {
          lastPart.text += char;
        } else {
          currentParts.push({ text: char });
        }
        currentWidth +=
          (currentCharacterCount ? CANVAS_LETTER_SPACING : 0) + charWidth;
        currentCharacterCount += 1;
      });
    });

    if (currentParts.length) {
      lines.push({ parts: currentParts, justify: false });
    }

    return lines.length ? lines : [{ parts, justify: false }];
  }

  function getCanvasHeight(layout: LayoutItem[]) {
    let y = CANVAS_TEXT_TOP;
    let lastLine:
      | {
          item: Extract<LayoutItem, { type: "text" }>;
          y: number;
        }
      | undefined;

    layout.forEach((item) => {
      if (item.type === "spacer") {
        y += item.height;
        return;
      }

      item.lines.forEach(() => {
        lastLine = { item, y };
        y += item.lineHeight;
      });

      y += item.afterGap;
    });

    if (!lastLine) {
      return Math.ceil(CANVAS_TEXT_TOP + CANVAS_BOTTOM_SAFE);
    }

    const inkHeight = lastLine.item.isTitle
      ? CANVAS_TITLE_FONT_SIZE
      : CANVAS_BODY_FONT_SIZE;
    return Math.ceil(lastLine.y + inkHeight + CANVAS_BOTTOM_SAFE);
  }

  function drawPartsLine(
    ctx: Canvas2DContext,
    line: LayoutLine,
    x: number,
    y: number,
    layoutItem: Extract<LayoutItem, { type: "text" }>,
  ) {
    const parts = line.parts;
    let currentX = x;
    let drawnCharacterCount = 0;
    const characterCount = parts.reduce(
      (total, part) => total + Array.from(part.text).length,
      0,
    );
    const naturalWidth = measurePartsLineWidth(ctx, parts, layoutItem);
    const justifiedExtraSpacing =
      line.justify && characterCount > 1
        ? Math.max(
            0,
            (CANVAS_TEXT_MAX_WIDTH - naturalWidth) / (characterCount - 1),
          )
        : 0;
    const letterSpacing = CANVAS_LETTER_SPACING + justifiedExtraSpacing;

    parts.forEach((part) => {
      ctx.font = layoutItem.isTitle ? CANVAS_TITLE_FONT : layoutItem.font;

      Array.from(part.text).forEach((character) => {
        ctx.fillText(character, currentX, y);
        currentX += ctx.measureText(character).width;
        drawnCharacterCount += 1;

        if (drawnCharacterCount < characterCount) {
          currentX += letterSpacing;
        }
      });
    });
  }

  function measurePartsLineWidth(
    ctx: Canvas2DContext,
    parts: TextPart[],
    layoutItem: Extract<LayoutItem, { type: "text" }>,
  ) {
    let width = 0;
    let characterCount = 0;

    parts.forEach((part) => {
      ctx.font = layoutItem.isTitle ? CANVAS_TITLE_FONT : layoutItem.font;

      Array.from(part.text).forEach((character) => {
        width += ctx.measureText(character).width;
        characterCount += 1;
      });
    });

    return width + Math.max(0, characterCount - 1) * CANVAS_LETTER_SPACING;
  }

  function drawCircleImage(ctx: Canvas2DContext, image: CanvasImage) {
    const x = (CANVAS_WIDTH - CIRCLE_IMAGE_SIZE) / 2;
    const y = CIRCLE_IMAGE_TOP;
    const radius = CIRCLE_IMAGE_SIZE / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, x, y, CIRCLE_IMAGE_SIZE, CIRCLE_IMAGE_SIZE);
    ctx.restore();
  }

  function scaleCanvasValue(value: number) {
    return Math.round(value * CANVAS_SCALE);
  }

  function createCanvasMetrics(quality: RenderQuality): CanvasMetrics {
    const width = quality === "preview" ? PREVIEW_CANVAS_WIDTH : CANVAS_WIDTH;

    return {
      width,
      scale: width / CANVAS_WIDTH,
    };
  }


  function ensureDouyin3FontLoaded() {
    return loadAppFont(APP_FONTS.lantingExtraLight);
  }
