import { checkTextContent } from "../../services/content-security";
import { APP_FONTS } from "../../config/fonts";
import { loadAppFont } from "../../services/font-loader";
import {
  getStoredTextCardContent,
  TEXT_CARD_STORAGE_KEYS,
} from "../../utils/text-card-storage";

  type ActionKey = "paste" | "copy" | "edit" | "clear" | "export";

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
    imagePaths: string[];
  };

  type SyncContentOptions = {
    isExample?: boolean;
    persist?: boolean;
    preferredImagePaths?: string[];
  };

  type StoredImageBindings = {
    version: 2;
    bindings: Array<{
      pageKey: string;
      path: string;
    }>;
  };

  type CanvasImage = {
    width: number;
    height: number;
    src: string;
    onload: (() => void) | null;
    onerror: ((error: unknown) => void) | null;
  };

  type Canvas2DNode = {
    width: number;
    height: number;
    getContext: (contextId: "2d") => Canvas2DContext;
    createImage: () => CanvasImage;
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
    drawImage: {
      (
        image: unknown,
        x: number,
        y: number,
        width: number,
        height: number,
      ): void;
      (
        image: unknown,
        sourceX: number,
        sourceY: number,
        sourceWidth: number,
        sourceHeight: number,
        destinationX: number,
        destinationY: number,
        destinationWidth: number,
        destinationHeight: number,
      ): void;
    };
    fillRect: (x: number, y: number, width: number, height: number) => void;
    fillText: (text: string, x: number, y: number) => void;
    measureText: (text: string) => { width: number };
    save: () => void;
    restore: () => void;
    beginPath: () => void;
    arc: (
      x: number,
      y: number,
      radius: number,
      startAngle: number,
      endAngle: number,
    ) => void;
    clip: () => void;
    getImageData?: (
      x: number,
      y: number,
      width: number,
      height: number,
    ) => { data: Uint8ClampedArray };
  };

  const STORAGE_KEY = TEXT_CARD_STORAGE_KEYS.douyin3;
  const LOCAL_IMAGES_STORAGE_KEY = "DOUYIN3_LOCAL_IMAGE_PATHS";
  const LEGACY_STORAGE_KEY = "DOUYIN3_FORM_DATA_CONTENT";
  const TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "douyin3ExportCanvas";
  const BASE_CANVAS_WIDTH = 300;
  const CANVAS_WIDTH = 2160;
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
      showClearUndo: false,
      canvasReady: false,
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
        const storedContent = getStoredTextCardContent("douyin3");
        const legacyContent = wx.getStorageSync(LEGACY_STORAGE_KEY);
        const storedImageValue = wx.getStorageSync(LOCAL_IMAGES_STORAGE_KEY);
        const initialContent =
          typeof storedContent === "string"
            ? storedContent
            : typeof legacyContent === "string"
              ? legacyContent
              : undefined;

        wx.setStorageSync(TEMPLATE_STORAGE_KEY, "douyin3");

        if (typeof initialContent === "string") {
          const pageKeys = createPageKeys(
            getContentSlides(initialContent).filter((source) =>
              getParagraphs(source).some((paragraph) => !paragraph.isSpacer),
            ),
          );
          this.syncContent(initialContent, 0, {
            preferredImagePaths: getStoredImagePaths(
              storedImageValue,
              pageKeys,
            ),
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
          this.refreshRenderedImages();
        });
      },
      detached() {
        if (clearUndoTimer) clearTimeout(clearUndoTimer);
        if (clearUndoSnapshot) {
          clearUndoSnapshot.imagePaths.filter(Boolean).forEach(removeLocalImageFile);
        }
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
        const template = event.currentTarget.dataset.template;
        if (template !== "xiaohongshu" && template !== "douyin2") return;

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

      loadDouyin3Font() {
        ensureDouyin3FontLoaded()
          .then(() => {
            this.refreshRenderedImages();
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

      handleChooseCircleImage(event: WechatMiniprogram.TouchEvent) {
        if (this.data.selectingImage || this.data.isGenerating) return;

        const targetIndex = Number(event.currentTarget.dataset.index);
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
        wx.navigateTo({
          url: "/pages/editor/index?source=douyin3",
        });
      },

      clearContent() {
        if (!this.data.hasCustomContent) return;

        if (clearUndoTimer) clearTimeout(clearUndoTimer);
        clearUndoSnapshot = {
          content: this.data.content,
          activeIndex: this.data.activeIndex,
          imagePaths: [...this.data.selectedImagePaths],
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
        this.finalizeClearUndo(false);
        this.syncContent(snapshot.content, snapshot.activeIndex, {
          preferredImagePaths: snapshot.imagePaths,
        });
      },

      finalizeClearUndo(removeImages = true) {
        if (clearUndoTimer) clearTimeout(clearUndoTimer);
        clearUndoTimer = undefined;

        if (removeImages && clearUndoSnapshot) {
          const activePaths = new Set(this.data.selectedImagePaths.filter(Boolean));
          clearUndoSnapshot.imagePaths
            .filter((path) => path && !activePaths.has(path))
            .forEach(removeLocalImageFile);
        }

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
            if (!(await this.ensureSafeContent(content))) return;

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

      async handleCopyContent() {
        if (!this.data.hasCustomContent) return;
        if (!(await this.ensureSafeContent(this.data.content))) return;

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
        if (!(await this.ensureSafeContent(this.data.content))) return;

        this.setData({ isGenerating: true });
        wx.showLoading({ title: "保存中" });

        try {
          const urls = await this.renderPagesToImages(
            this.data.selectedImagePaths,
          );
          if (!urls.length) {
            wx.hideLoading();
            wx.showToast({
              title: "暂无内容",
              icon: "none",
            });
            return;
          }

          for (const url of urls) {
            await saveImageToPhotosAlbum(url);
          }

          wx.hideLoading();
          wx.showToast({
            title: "已保存",
            icon: "success",
          });
        } catch (error) {
          console.error("保存图片失败", error);
          wx.hideLoading();
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
        this.setData({
          isRenderingCards: true,
          renderError: false,
          renderErrorMessage: "生成失败，请重试",
        });

        try {
          const urls = await this.renderPagesToImages();
          if (requestId !== renderRequestId) return;

          this.setData({
            renderedImageUrls: urls,
            renderError: false,
          });
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
            this.setData({ isRenderingCards: false });
          }
        }
      },

      retryPreview() {
        if (this.data.isRenderingCards) return;
        this.refreshRenderedImages();
      },

      renderPagesToImages(circleImagePaths: string[] = []): Promise<string[]> {
        const pages = this.data.pages;

        return enqueueRender(async () => {
          try {
            await ensureDouyin3FontLoaded();
          } catch (error) {
            console.warn("模板三方正兰亭黑 ExtraLight 不可用，使用系统字体回退", error);
          }

          const urls: string[] = [];

          for (const [index, page] of pages.entries()) {
            urls.push(
              await this.generatePageImage(
                page,
                circleImagePaths[index] || "",
              ),
            );
          }

          return urls;
        });
      },

      async generatePageImage(
        page: Paragraph[],
        circleImagePath = "",
      ): Promise<string> {
        const canvas = await this.getExportCanvas();
        const ctx = canvas.getContext("2d");
        const backgroundImage = await loadCanvasImage(canvas, BACKGROUND_IMAGE);
        const circleImage = circleImagePath
          ? await loadCanvasImage(canvas, circleImagePath)
          : undefined;
        canvas.width = CANVAS_WIDTH;
        canvas.height = Math.ceil(
          Math.max(CANVAS_TITLE_LINE_HEIGHT, CANVAS_BODY_LINE_HEIGHT) * 2,
        );
        const layout = createPageLayout(page, ctx);
        const canvasHeight = getCanvasHeight(ctx, layout);

        canvas.width = CANVAS_WIDTH;
        canvas.height = canvasHeight;

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

        return canvasToTempFilePath(canvas, canvasHeight);
      },

      getExportCanvas(): Promise<Canvas2DNode> {
        return this.getCanvasNode(CANVAS_ID);
      },

      getCanvasNode(canvasId: string): Promise<Canvas2DNode> {
        return new Promise((resolve, reject) => {
          this.createSelectorQuery()
            .select(`#${canvasId}`)
            .node((result) => {
              if (result && result.node) {
                resolve(result.node as Canvas2DNode);
                return;
              }

              reject(new Error(`未找到 canvas：${canvasId}`));
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
        renderRequestId += 1;

        this.setData(
          {
            content,
            hasCustomContent,
            isExampleContent,
            pages,
            pageKeys,
            selectedImagePaths,
            renderedImageUrls: [],
            isRenderingCards: false,
            renderError: false,
            renderErrorMessage: "生成失败，请重试",
            activeIndex: nextActiveIndex,
          },
          () => {
            this.refreshRenderedImages();
          },
        );

        if (options.persist !== false) {
          wx.setStorageSync(STORAGE_KEY, content);
          persistLocalImagePaths(selectedImagePaths, pageKeys);
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
    return text.startsWith("［") || /^\d{2}$/.test(text);
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
    const pageTitle =
      nextPage <= 99 ? String(nextPage).padStart(2, "0") : `［第 ${nextPage} 页］`;
    return `${current}\n\n${pageTitle}\n${pasted}`;
  }

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
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\u2800/g, " ")
      .replace(/`/g, "");
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

  function getCanvasHeight(ctx: Canvas2DContext, layout: LayoutItem[]) {
    let y = CANVAS_TEXT_TOP;
    let lastLine:
      | {
          line: LayoutLine;
          item: Extract<LayoutItem, { type: "text" }>;
          y: number;
        }
      | undefined;

    layout.forEach((item) => {
      if (item.type === "spacer") {
        y += item.height;
        return;
      }

      item.lines.forEach((line) => {
        lastLine = { line, item, y };
        y += item.lineHeight;
      });

      y += item.afterGap;
    });

    if (!lastLine) {
      return Math.ceil(CANVAS_TEXT_TOP + CANVAS_BOTTOM_SAFE);
    }

    const inkHeight = measureLineInkHeight(ctx, lastLine.line, lastLine.item);
    return Math.ceil(lastLine.y + inkHeight + CANVAS_BOTTOM_SAFE);
  }

  function measureLineInkHeight(
    ctx: Canvas2DContext,
    line: LayoutLine,
    item: Extract<LayoutItem, { type: "text" }>,
  ) {
    const fallbackHeight = item.isTitle
      ? CANVAS_TITLE_FONT_SIZE
      : CANVAS_BODY_FONT_SIZE;
    if (!ctx.getImageData) return fallbackHeight;

    const measurementHeight = Math.ceil(
      Math.max(CANVAS_TITLE_LINE_HEIGHT, CANVAS_BODY_LINE_HEIGHT) * 2,
    );

    try {
      ctx.clearRect(0, 0, CANVAS_WIDTH, measurementHeight);
      ctx.fillStyle = "#000000";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      drawPartsLine(ctx, line, CANVAS_PADDING_LEFT, 0, item);

      const pixels = ctx.getImageData(
        0,
        0,
        CANVAS_WIDTH,
        measurementHeight,
      ).data;

      for (let row = measurementHeight - 1; row >= 0; row -= 1) {
        const rowStart = row * CANVAS_WIDTH * 4;
        const rowEnd = rowStart + CANVAS_WIDTH * 4;

        for (let offset = rowStart + 3; offset < rowEnd; offset += 4) {
          if (pixels[offset] > 0) return row + 1;
        }
      }
    } catch (error) {
      console.warn("测量文字可见范围失败，使用字号回退", error);
    }

    return fallbackHeight;
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

  function saveImageToPhotosAlbum(filePath: string) {
    return new Promise<void>((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: reject,
      });
    });
  }

  function getStoredImagePaths(value: unknown, pageKeys: string[]) {
    if (Array.isArray(value)) {
      return pageKeys.map((_, index) =>
        typeof value[index] === "string" ? value[index] : "",
      );
    }

    if (!isStoredImageBindings(value)) return pageKeys.map(() => "");
    const pathByPageKey = new Map(
      value.bindings.map((binding) => [binding.pageKey, binding.path]),
    );
    return pageKeys.map((pageKey) => pathByPageKey.get(pageKey) || "");
  }

  function persistLocalImagePaths(paths: string[], pageKeys: string[]) {
    const bindings = paths.flatMap((path, index) => {
      const pageKey = pageKeys[index];
      return path && pageKey ? [{ pageKey, path }] : [];
    });

    if (bindings.length) {
      const value: StoredImageBindings = { version: 2, bindings };
      wx.setStorageSync(LOCAL_IMAGES_STORAGE_KEY, value);
      return;
    }
    wx.removeStorageSync(LOCAL_IMAGES_STORAGE_KEY);
  }

  function isStoredImageBindings(value: unknown): value is StoredImageBindings {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<StoredImageBindings>;
    return (
      candidate.version === 2 &&
      Array.isArray(candidate.bindings) &&
      candidate.bindings.every(
        (binding) =>
          Boolean(binding) &&
          typeof binding.pageKey === "string" &&
          typeof binding.path === "string",
      )
    );
  }

  function saveLocalImageFile(tempFilePath: string) {
    return new Promise<string>((resolve, reject) => {
      wx.saveFile({
        tempFilePath,
        success: (result) => resolve(result.savedFilePath),
        fail: reject,
      });
    });
  }

  function removeLocalImageFile(filePath: string) {
    wx.removeSavedFile({
      filePath,
      fail: (error) => {
        console.warn("删除模板三本地图片失败", error);
      },
    });
  }

  function loadCanvasImage(canvas: Canvas2DNode, src: string) {
    return new Promise<CanvasImage>((resolve, reject) => {
      const image = canvas.createImage();

      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function canvasToTempFilePath(canvas: Canvas2DNode, canvasHeight: number) {
    return new Promise<string>((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        width: CANVAS_WIDTH,
        height: canvasHeight,
        destWidth: CANVAS_WIDTH,
        destHeight: canvasHeight,
        fileType: "png",
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      });
    });
  }

  function ensureDouyin3FontLoaded() {
    return loadAppFont(APP_FONTS.lantingExtraLight);
  }

  function enqueueRender<T>(task: () => Promise<T>) {
    const run = renderChain.then(task, task);
    renderChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
