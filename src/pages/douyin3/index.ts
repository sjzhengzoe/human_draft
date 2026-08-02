import { checkTextContent } from "../../services/content-security";

  type ActionKey = "paste" | "copy" | "edit" | "clear" | "export";

  type TextPart = {
    text: string;
    emphasis: boolean;
  };

  type Paragraph = {
    parts: TextPart[];
    isTitle: boolean;
    isSpacer: boolean;
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

  const STORAGE_KEY = "TEXT_CARD_CONTENT";
  const LOCAL_IMAGES_STORAGE_KEY = "DOUYIN3_LOCAL_IMAGE_PATHS";
  const LEGACY_STORAGE_KEY = "DOUYIN2_FORM_DATA_CONTENT";
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
  const DOUYIN3_FONT_FAMILY = "FangzhengLantingheiExtralight";
  const DOUYIN3_FONT_URL =
    "https://gufeifei.cn/fonts/FZLTHProGlobal-Extralight.woff2?v=20260802";
  const CANVAS_TEXT_FONT_FAMILY = `"${DOUYIN3_FONT_FAMILY}", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
  const CANVAS_BODY_FONT = `normal ${CANVAS_BODY_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_BOLD_FONT = `normal ${CANVAS_BODY_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_TITLE_FONT = `bold ${CANVAS_TITLE_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const DOUYIN_TAGS = "#文字的力量 #记录真实生活 #思考 #讨论";
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

  let douyin3FontPromise: Promise<void> | undefined;
  let renderRequestId = 0;
  let renderChain = Promise.resolve();

  Component({
    data: {
      activeTemplate: "douyin3",
      content: "",
      hasCustomContent: false,
      editContent: "",
      showEditTextarea: false,
      pages: [] as Paragraph[][],
      renderedImageUrls: [] as string[],
      activeIndex: 0,
      showEditModal: false,
      isGenerating: false,
      isRenderingCards: false,
      canvasReady: false,
      selectedImagePaths: [] as string[],
      selectingImage: false,
      selectingImageIndex: -1,
      showCropModal: false,
      cropSourcePath: "",
      cropTargetIndex: -1,
    },
    lifetimes: {
      attached() {
        const storedContent = wx.getStorageSync(STORAGE_KEY);
        const legacyContent = wx.getStorageSync(LEGACY_STORAGE_KEY);
        const storedImagePaths = getStoredImagePaths(
          wx.getStorageSync(LOCAL_IMAGES_STORAGE_KEY),
        );
        const initialContent =
          typeof storedContent === "string"
            ? storedContent
            : typeof legacyContent === "string"
              ? legacyContent
              : undefined;

        wx.setStorageSync(TEMPLATE_STORAGE_KEY, "douyin3");
        this.setData({ selectedImagePaths: storedImagePaths });

        if (typeof initialContent === "string") {
          this.loadStoredContent(initialContent);
        } else {
          this.syncContent(DEFAULT_CONTENT);
        }
        this.loadDouyin3Font();
      },
      ready() {
        this.setData({ canvasReady: true }, () => {
          this.refreshRenderedImages();
        });
      },
    },
    pageLifetimes: {
      show() {
        const storedContent = wx.getStorageSync(STORAGE_KEY);

        if (
          typeof storedContent === "string" &&
          storedContent !== this.data.content
        ) {
          this.loadStoredContent(storedContent, this.data.activeIndex);
        }
      },
    },
    methods: {
      handleTemplateChange(event: WechatMiniprogram.TouchEvent) {
        const template = event.currentTarget.dataset.template;
        if (template !== "xiaohongshu" && template !== "douyin2") return;

        wx.setStorageSync(TEMPLATE_STORAGE_KEY, template);
        wx.redirectTo({ url: `/pages/${template}/index` });
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
          persistLocalImagePaths(selectedImagePaths);
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

      closeEditModal() {
        this.setData({
          showEditModal: false,
          showEditTextarea: false,
        });
      },

      noop() {},

      handleEditInput(event: WechatMiniprogram.Input) {
        this.setData({
          editContent: event.detail.value,
        });
      },

      clearEditContent() {
        this.setData({
          editContent: "",
        });
      },

      clearContent() {
        this.syncContent("");
        wx.showToast({
          title: "已清空",
          icon: "success",
        });
      },

      async saveEditContent() {
        const content = this.data.editContent.trim();
        if (!(await this.ensureSafeContent(content))) return;

        this.syncContent(content);
        this.closeEditModal();
        wx.showToast({
          title: "已保存",
          icon: "success",
        });
      },

      handlePasteContent() {
        wx.getClipboardData({
          success: async (result) => {
            const content = result.data.trim();
            if (!content) {
              wx.showToast({
                title: "剪贴板为空",
                icon: "none",
              });
              return;
            }

            if (!(await this.ensureSafeContent(content))) return;

            this.syncContent(content);
            wx.showToast({
              title: "已粘贴",
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
        this.setData({ isRenderingCards: true });

        try {
          const urls = await this.renderPagesToImages();
          if (requestId !== renderRequestId) return;

          this.setData({
            renderedImageUrls: urls,
          });
        } catch (error) {
          if (requestId === renderRequestId) {
            console.error("生成页面卡片失败", error);
          }
        } finally {
          if (requestId === renderRequestId) {
            this.setData({ isRenderingCards: false });
          }
        }
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

      syncContent(content: string, activeIndex = 0) {
        const hasCustomContent = Boolean(content.trim());
        const pages = hasCustomContent ? getPages(content) : [];
        const previousImagePaths = [...this.data.selectedImagePaths];
        const selectedImagePaths = pages.map(
          (_, index) => this.data.selectedImagePaths[index] || "",
        );
        const removedImagePaths = previousImagePaths.filter(
          (path) => path && !selectedImagePaths.includes(path),
        );
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(pages.length - 1, 0),
        );

        this.setData(
          {
            content,
            hasCustomContent,
            pages,
            selectedImagePaths,
            renderedImageUrls: [],
            activeIndex: nextActiveIndex,
          },
          () => {
            this.refreshRenderedImages();
          },
        );

        wx.setStorageSync(STORAGE_KEY, content);
        persistLocalImagePaths(selectedImagePaths);
        removedImagePaths.forEach(removeLocalImageFile);
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
        parts: isSpacer ? [] : parseEmphasis(line),
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
    return text.startsWith("［") || /^(?:0\d|1\d)$/.test(text);
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
    return text.replace(/\r\n/g, "\n").replace(/\u2800/g, " ");
  }

  function parseEmphasis(text: string) {
    return text
      .split(/(`.*?`)/g)
      .filter(Boolean)
      .map((part) => {
        const emphasis = part.startsWith("`") && part.endsWith("`");
        return {
          text: emphasis ? part.slice(1, -1) : part,
          emphasis,
        };
      })
      .filter((part) => part.text);
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
        ctx.font = isTitle
          ? CANVAS_TITLE_FONT
          : part.emphasis
            ? CANVAS_BOLD_FONT
            : CANVAS_BODY_FONT;
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
        if (lastPart && lastPart.emphasis === part.emphasis) {
          lastPart.text += char;
        } else {
          currentParts.push({ text: char, emphasis: part.emphasis });
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
      ctx.font =
        layoutItem.isTitle || part.emphasis
          ? CANVAS_BOLD_FONT
          : layoutItem.font;
      if (layoutItem.isTitle) {
        ctx.font = CANVAS_TITLE_FONT;
      }

      const partStartX = currentX;

      Array.from(part.text).forEach((character) => {
        ctx.fillText(character, currentX, y);
        currentX += ctx.measureText(character).width;
        drawnCharacterCount += 1;

        if (drawnCharacterCount < characterCount) {
          currentX += letterSpacing;
        }
      });

      if (part.emphasis) {
        const width = currentX - partStartX;
        ctx.fillRect(
          partStartX,
          y + CANVAS_BODY_LINE_HEIGHT - scaleCanvasValue(12),
          width,
          scaleCanvasValue(2),
        );
      }
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
      ctx.font =
        layoutItem.isTitle || part.emphasis
          ? CANVAS_BOLD_FONT
          : layoutItem.font;
      if (layoutItem.isTitle) {
        ctx.font = CANVAS_TITLE_FONT;
      }

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

  function getStoredImagePaths(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => (typeof item === "string" ? item : ""));
  }

  function persistLocalImagePaths(paths: string[]) {
    if (paths.some(Boolean)) {
      wx.setStorageSync(LOCAL_IMAGES_STORAGE_KEY, paths);
      return;
    }
    wx.removeStorageSync(LOCAL_IMAGES_STORAGE_KEY);
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
    if (douyin3FontPromise) return douyin3FontPromise;

    douyin3FontPromise = new Promise<void>((resolve, reject) => {
      wx.loadFontFace({
        family: DOUYIN3_FONT_FAMILY,
        source: `url("${DOUYIN3_FONT_URL}")`,
        desc: {
          style: "normal",
          weight: "normal",
        },
        global: true,
        scopes: ["webview", "native"],
        success: () => {
          setTimeout(resolve, 80);
        },
        fail: (error) => {
          douyin3FontPromise = undefined;
          reject(error);
        },
      });
    });

    return douyin3FontPromise;
  }

  function enqueueRender<T>(task: () => Promise<T>) {
    const run = renderChain.then(task, task);
    renderChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
