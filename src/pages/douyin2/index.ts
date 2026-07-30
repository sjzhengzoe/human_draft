import { checkTextContent } from "../../services/content-security";

  type ActionKey = "paste" | "copy" | "edit" | "export";

  type TextPart = {
    text: string;
    emphasis: boolean;
  };

  type Paragraph = {
    parts: TextPart[];
    isTitle: boolean;
    isSpacer: boolean;
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
  };

  const STORAGE_KEY = "DOUYIN2_FORM_DATA_CONTENT";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "douyin2ExportCanvas";
  const BASE_CANVAS_WIDTH = 300;
  const BASE_CANVAS_HEIGHT = 400;
  const CANVAS_WIDTH = 2160;
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
  const DOUYIN2_FONT_FAMILY = "FangzhengBoyaFangkansong";
  const DOUYIN2_FONT_URL =
    "https://gufeifei.cn/fonts/fangzhengboyafangkansong.woff2?v=20260705";
  const CANVAS_TEXT_FONT_FAMILY = `"${DOUYIN2_FONT_FAMILY}", "Songti SC", STSong, "Noto Serif CJK SC", serif`;
  const CANVAS_BODY_FONT = `normal ${CANVAS_BODY_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_BOLD_FONT = `bold ${CANVAS_BODY_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_TITLE_FONT = `bold ${CANVAS_TITLE_FONT_SIZE}px ${CANVAS_TEXT_FONT_FAMILY}`;
  const CANVAS_MAX_CHARS_PER_LINE = 21;
  const CANVAS_TITLE_MAX_CHARS_PER_LINE = 18;
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

  let douyin2FontPromise: Promise<void> | undefined;
  let renderRequestId = 0;
  let renderChain = Promise.resolve();

  Component({
    data: {
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
      actions: [
        { key: "paste", label: "粘贴", icon: "clipboard-paste" },
        { key: "copy", label: "复制", icon: "copy" },
        { key: "edit", label: "编辑", icon: "pencil" },
        { key: "export", label: "导出", icon: "download" },
      ],
    },
    lifetimes: {
      attached() {
        const storedContent = wx.getStorageSync(STORAGE_KEY);
        if (typeof storedContent === "string") {
          this.loadStoredContent(storedContent);
        } else {
          this.syncContent(DEFAULT_CONTENT);
        }
        this.loadDouyin2Font();
      },
      ready() {
        this.setData({ canvasReady: true }, () => {
          this.refreshRenderedImages();
        });
      },
    },
    pageLifetimes: {
      async show() {
        const storedContent = wx.getStorageSync(STORAGE_KEY);

        if (
          typeof storedContent === "string" &&
          storedContent !== this.data.content
        ) {
          await this.loadStoredContent(storedContent, this.data.activeIndex);
        }
      },
    },
    methods: {
      loadDouyin2Font() {
        ensureDouyin2FontLoaded()
          .then(() => {
            this.refreshRenderedImages();
          })
          .catch((error) => {
            console.warn("加载抖音 2 字体失败，使用系统字体回退", error);
          });
      },

      async loadStoredContent(content: string, activeIndex = 0) {
        if (content.trim() && !(await this.ensureSafeContent(content))) {
          this.syncContent("");
          return;
        }
        this.syncContent(content, activeIndex);
      },

      handleAction(event: WechatMiniprogram.TouchEvent) {
        if (this.data.isGenerating) return;

        const key = event.currentTarget.dataset.key as ActionKey | undefined;

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
          const urls = await this.renderPagesToImages();
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

      renderPagesToImages(): Promise<string[]> {
        const pages = this.data.pages;

        return enqueueRender(async () => {
          try {
            await ensureDouyin2FontLoaded();
          } catch (error) {
            console.warn("抖音 2 字体不可用，使用系统字体回退", error);
          }

          const urls: string[] = [];

          for (const page of pages) {
            urls.push(await this.generatePageImage(page));
          }

          return urls;
        });
      },

      async generatePageImage(page: Paragraph[]): Promise<string> {
        const canvas = await this.getExportCanvas();
        const ctx = canvas.getContext("2d");
        const backgroundImage = await loadCanvasImage(canvas, BACKGROUND_IMAGE);

        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "rgba(255, 251, 240, 0.26)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "#000000";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        const layout = createPageLayout(page);
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

        return canvasToTempFilePath(canvas);
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

      syncContent(content: string, activeIndex = 0) {
        const hasCustomContent = Boolean(content.trim());
        const pages = hasCustomContent ? getPages(content) : [];
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(pages.length - 1, 0),
        );

        this.setData(
          {
            content,
            hasCustomContent,
            pages,
            renderedImageUrls: [],
            activeIndex: nextActiveIndex,
          },
          () => {
            this.refreshRenderedImages();
          },
        );

        wx.setStorageSync(STORAGE_KEY, content);
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
    return line.trim().startsWith("［");
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
    return text.replace(/\r\n/g, "\n");
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
        if (lastPart && lastPart.emphasis === part.emphasis) {
          lastPart.text += char;
        } else {
          currentParts.push({ text: char, emphasis: part.emphasis });
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
      ctx.font =
        layoutItem.isTitle || part.emphasis
          ? CANVAS_BOLD_FONT
          : layoutItem.font;
      if (layoutItem.isTitle) {
        ctx.font = CANVAS_TITLE_FONT;
      }

      ctx.fillText(part.text, currentX, y);

      const width = ctx.measureText(part.text).width;
      if (part.emphasis) {
        ctx.fillRect(
          currentX,
          y + CANVAS_BODY_LINE_HEIGHT - scaleCanvasValue(12),
          width,
          scaleCanvasValue(2),
        );
      }

      currentX += width;
    });
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

  function loadCanvasImage(canvas: Canvas2DNode, src: string) {
    return new Promise<unknown>((resolve, reject) => {
      const image = canvas.createImage();

      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function canvasToTempFilePath(canvas: Canvas2DNode) {
    return new Promise<string>((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        destWidth: CANVAS_WIDTH,
        destHeight: CANVAS_HEIGHT,
        fileType: "png",
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      });
    });
  }

  function ensureDouyin2FontLoaded() {
    if (douyin2FontPromise) return douyin2FontPromise;

    douyin2FontPromise = new Promise<void>((resolve, reject) => {
      wx.loadFontFace({
        family: DOUYIN2_FONT_FAMILY,
        source: `url("${DOUYIN2_FONT_URL}")`,
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
          douyin2FontPromise = undefined;
          reject(error);
        },
      });
    });

    return douyin2FontPromise;
  }

  function enqueueRender<T>(task: () => Promise<T>) {
    const run = renderChain.then(task, task);
    renderChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
