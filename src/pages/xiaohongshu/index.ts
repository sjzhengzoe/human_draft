import { checkTextContent } from "../../services/content-security";

  type ActionKey = "paste" | "copy" | "edit" | "clear" | "export";
  type CopyMode = "xiaohongshu" | "douyin";

  type Slide = {
    order: string;
    paragraphs: string[];
  };

  type CombinedFontOption = {
    family: string;
    url: string;
    fontSize: number;
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

  const STORAGE_KEY = "TEXT_CARD_CONTENT";
  const LEGACY_STORAGE_KEY = "XIAOHONGSHU_FORM_DATA_CONTENT";
  const TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE";
  const BACKGROUND_IMAGE = "/assets/background/theme_bg22-optimized.jpg";
  const CANVAS_ID = "xiaohongshuExportCanvas";
  const BASE_CANVAS_WIDTH = 1080;
  const BASE_CANVAS_HEIGHT = 1440;
  const CANVAS_WIDTH = 2880;
  const CANVAS_SCALE = CANVAS_WIDTH / BASE_CANVAS_WIDTH;
  const CANVAS_HEIGHT = Math.round(BASE_CANVAS_HEIGHT * CANVAS_SCALE);
  const RED3_FONT_FAMILY = "Red3GB2312";
  const RED3_FONT_URL =
    "https://www.gufeifei.cn/fonts/red3-gb2312.woff2?v=20260705";
  const CANVAS_FONT_SIZE = scaleCanvasValue(40);
  const CANVAS_TEXT_FONT = `normal ${CANVAS_FONT_SIZE}px "${RED3_FONT_FAMILY}", "Songti SC", STSong, "Noto Serif CJK SC", serif`;
  const CANVAS_TEXT_X = scaleCanvasValue(80);
  const CANVAS_SAFE_Y = scaleCanvasValue(100);
  const CANVAS_LINE_HEIGHT = scaleCanvasValue(62);
  const CANVAS_ORDER_BODY_GAP = scaleCanvasValue(54);
  const CANVAS_PARAGRAPH_GAP = scaleCanvasValue(32);
  const CANVAS_TEXT_MAX_WIDTH = CANVAS_WIDTH - CANVAS_TEXT_X * 2;
  const SECOND_THEME_BASE_WIDTH = 300;
  const SECOND_THEME_SCALE = CANVAS_WIDTH / SECOND_THEME_BASE_WIDTH;
  const SECOND_THEME_PADDING_LEFT = scaleSecondThemeValue(22);
  const SECOND_THEME_PADDING_RIGHT = scaleSecondThemeValue(26);
  const SECOND_THEME_SAFE_Y = scaleSecondThemeValue(38);
  const SECOND_THEME_BODY_FONT_SIZE = scaleCanvasValue(34);
  const SECOND_THEME_BODY_LINE_HEIGHT = CANVAS_LINE_HEIGHT;
  const SECOND_THEME_ORDER_BOTTOM_GAP = scaleSecondThemeValue(3);
  const SECOND_THEME_SECTION_GAP = SECOND_THEME_BODY_LINE_HEIGHT;
  const SECOND_THEME_FONT_FAMILY = "FangzhengLantingheiExtralight";
  const SECOND_THEME_FONT_URL =
    "https://gufeifei.cn/fonts/FZLTHProGlobal-Extralight.woff2?v=20260802";
  const COMBINED_FONT_OPTIONS: CombinedFontOption[] = [
    {
      family: SECOND_THEME_FONT_FAMILY,
      url: SECOND_THEME_FONT_URL,
      fontSize: SECOND_THEME_BODY_FONT_SIZE,
    },
  ];
  const XIAOHONGSHU_BLANK_LINE = "\u2800";
  const XIAOHONGSHU_TAGS =
    "#日记复兴计划[话题]# #一些有感而发[话题]# #文字复兴单元[话题]# #文字[话题]# #随便记录点什么[话题]# #日常记录[话题]# #记录真实生活[话题]#";
  const DOUYIN_TAGS = "#文字的力量 #记录真实生活 #思考 #讨论";
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

  let red3FontPromise: Promise<void> | undefined;
  const combinedFontPromises = new Map<string, Promise<void>>();
  let renderRequestId = 0;
  let renderChain = Promise.resolve();

  Component({
    data: {
      activeTemplate: "xiaohongshu",
      content: "",
      hasCustomContent: false,
      editContent: "",
      showEditTextarea: false,
      slides: [] as Slide[],
      renderedImageUrls: [] as string[],
      previewCount: 0,
      activeIndex: 0,
      showEditModal: false,
      isGenerating: false,
      isRenderingCards: false,
      canvasReady: false,
      fontLoaded: false,
    },
    lifetimes: {
      attached() {
        const storedContent = wx.getStorageSync(STORAGE_KEY);
        const legacyContent = wx.getStorageSync(LEGACY_STORAGE_KEY);
        const initialContent =
          typeof storedContent === "string"
            ? storedContent
            : typeof legacyContent === "string"
              ? legacyContent
              : undefined;

        wx.setStorageSync(TEMPLATE_STORAGE_KEY, "xiaohongshu");

        if (typeof initialContent === "string") {
          this.loadStoredContent(initialContent);
        } else {
          this.syncContent(DEFAULT_CONTENT);
        }
        this.loadRed3Font();
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
        if (template !== "douyin2" && template !== "douyin3") return;

        wx.setStorageSync(TEMPLATE_STORAGE_KEY, template);
        wx.redirectTo({ url: `/pages/${template}/index` });
      },

      loadRed3Font() {
        ensureRed3FontLoaded()
          .then(() => {
            this.setData({ fontLoaded: true }, () => {
              if (
                this.data.canvasReady &&
                !this.data.isRenderingCards &&
                !this.data.renderedImageUrls.length
              ) {
                this.refreshRenderedImages();
              }
            });
          })
          .catch((error) => {
            console.warn("加载 red3 字体失败，使用系统字体回退", error);
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
        wx.navigateTo({
          url: "/pages/editor/index?source=xiaohongshu",
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
            const storedContent = wx.getStorageSync(STORAGE_KEY);
            const currentContent =
              typeof storedContent === "string"
                ? storedContent
                : this.data.content;
            const nextOrder = getNextSlideOrder(currentContent);
            const pastedEntry = createPastedEntry(result.data, nextOrder);
            if (!pastedEntry) {
              wx.showToast({
                title: "剪贴板为空",
                icon: "none",
              });
              return;
            }

            const nextContent = appendPastedEntry(currentContent, pastedEntry);
            const nextActiveIndex = Math.max(
              getContentSlides(nextContent).length - 1,
              0,
            );
            if (!(await this.ensureSafeContent(nextContent))) return;

            this.syncContent(nextContent, nextActiveIndex);
            wx.showToast({
              title: `已追加 ${nextOrder}`,
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

      clearContent() {
        this.syncContent("");
        wx.setStorageSync(STORAGE_KEY, "");
        wx.showToast({
          title: "已清空",
          icon: "success",
        });
      },

      openCopyModePicker() {
        wx.showActionSheet({
          itemList: ["复制小红书", "复制抖音版"],
          success: (result) => {
            this.handleCopyContent(
              result.tapIndex === 0 ? "xiaohongshu" : "douyin",
            );
          },
        });
      },

      async handleCopyContent(mode: CopyMode) {
        if (!(await this.ensureSafeContent(this.data.content))) return;

        const text =
          mode === "xiaohongshu"
            ? getXiaohongshuCopyableContent(this.data.content)
            : getDouyinCopyableContent(this.data.content);

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
          const urls = await this.generateExportImages();
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
        if (!this.data.canvasReady || !this.data.slides.length) return;

        const requestId = ++renderRequestId;
        this.setData({ isRenderingCards: true });

        try {
          const urls = await this.renderSlidesToImages();
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

      renderSlidesToImages(): Promise<string[]> {
        return this.generateExportImages();
      },

      generateExportImages(): Promise<string[]> {
        return enqueueRender(async () => {
          try {
            await ensureRed3FontLoaded();
          } catch (error) {
            console.warn("red3 字体不可用，使用系统字体回退", error);
          }

          const urls: string[] = [];

          for (const slide of this.data.slides) {
            urls.push(await this.generateSlideImage(slide));
          }

          for (const fontOption of COMBINED_FONT_OPTIONS) {
            try {
              await ensureCombinedFontLoaded(fontOption);
            } catch (error) {
              console.warn("合并图字体不可用，使用系统字体回退", error);
            }
            urls.push(
              await this.generateCombinedImage(
                this.data.slides,
                fontOption.family,
                fontOption.fontSize,
              ),
            );
          }

          return urls;
        });
      },

      async generateSlideImage(slide: Slide): Promise<string> {
        const canvas = await this.getExportCanvas();
        const ctx = canvas.getContext("2d");

        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const backgroundImage = await loadCanvasImage(canvas, BACKGROUND_IMAGE);
        ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "rgba(255, 251, 240, 0.26)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "#1a1a1a";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = CANVAS_TEXT_FONT;

        const paragraphLines = slide.paragraphs.map((paragraph) =>
          paragraph
            .split("\n")
            .flatMap((line) => wrapLine(line, ctx, CANVAS_TEXT_MAX_WIDTH)),
        );
        const textBlockHeight = getCanvasTextBlockHeight(paragraphLines);
        const textTop = Math.max(
          CANVAS_SAFE_Y,
          Math.round((CANVAS_HEIGHT - textBlockHeight) / 2),
        );

        ctx.fillText(slide.order, CANVAS_TEXT_X, textTop);

        let y = textTop + CANVAS_LINE_HEIGHT + CANVAS_ORDER_BODY_GAP;
        paragraphLines.forEach((lines) => {
          lines.forEach((line) => {
            if (y <= CANVAS_HEIGHT - CANVAS_SAFE_Y) {
              drawCanvasTextLine(
                ctx,
                line,
                CANVAS_TEXT_X,
                y,
                CANVAS_TEXT_MAX_WIDTH,
              );
            }
            y += CANVAS_LINE_HEIGHT;
          });

          y += CANVAS_PARAGRAPH_GAP;
        });

        return canvasToTempFilePath(canvas);
      },

      async generateCombinedImage(
        slides: Slide[],
        fontFamily: string,
        fontSize: number,
      ): Promise<string> {
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

        const layout = createCombinedLayout(
          slides,
          fontFamily,
          fontSize,
          ctx,
        );
        const textTop = Math.max(
          SECOND_THEME_SAFE_Y,
          Math.round((CANVAS_HEIGHT - layout.height) / 2),
        );
        let y = textTop;

        ctx.font = layout.font;
        layout.sections.forEach((section, index) => {
          ctx.fillText(section.order, SECOND_THEME_PADDING_LEFT, y);
          y += layout.lineHeight + layout.orderBottomGap;

          section.lines.forEach((line) => {
            drawCanvasTextLine(
              ctx,
              line,
              SECOND_THEME_PADDING_LEFT,
              y,
              CANVAS_WIDTH -
                SECOND_THEME_PADDING_LEFT -
                SECOND_THEME_PADDING_RIGHT,
            );
            y += layout.lineHeight;
          });

          if (index < layout.sections.length - 1) {
            y += layout.sectionGap;
          }
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
        const slides = hasCustomContent ? getContentSlides(content) : [];
        const previewCount = slides.length
          ? slides.length + COMBINED_FONT_OPTIONS.length
          : 0;
        const nextActiveIndex = Math.min(
          Math.max(activeIndex, 0),
          Math.max(previewCount - 1, 0),
        );

        this.setData(
          {
            content,
            hasCustomContent,
            slides,
            renderedImageUrls: [],
            previewCount,
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

  function getXiaohongshuCopyableContent(content: string) {
    const body = getXiaohongshuCopyableBody(content);

    return [body, XIAOHONGSHU_BLANK_LINE, XIAOHONGSHU_TAGS].join("\n");
  }

  function getDouyinCopyableContent(content: string) {
    const body = getXiaohongshuCopyableBody(content);

    return [body, XIAOHONGSHU_BLANK_LINE, DOUYIN_TAGS].join("\n");
  }

  function appendPastedEntry(currentContent: string, pastedEntry: string) {
    const current = currentContent.trim();

    if (!current) return pastedEntry;

    return [current, pastedEntry].join("\n\n");
  }

  function createPastedEntry(content: string, order: string) {
    const lines = normalizeText(content)
      .split("\n")
      .map((line) => line.trimEnd());

    while (lines.length && !lines[0].trim()) {
      lines.shift();
    }

    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    if (!lines.length) return "";

    const firstContentLineIndex = lines.findIndex((line) => line.trim());

    if (
      firstContentLineIndex >= 0 &&
      lines[firstContentLineIndex].trim().startsWith("#")
    ) {
      lines.splice(firstContentLineIndex, 1);
    }

    const body = lines.join("\n").trim();

    return body ? `${order}\n${body}` : order;
  }

  function getNextSlideOrder(content: string) {
    const nextIndex = getContentSlides(content).length + 1;

    return String(nextIndex).padStart(2, "0");
  }

  function getXiaohongshuCopyableBody(content: string) {
    const lines = normalizeText(content)
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !line.trim().startsWith("#"));

    while (lines.length && !lines[0].trim()) {
      lines.shift();
    }

    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    return lines
      .map((line) => (line.trim() ? line : XIAOHONGSHU_BLANK_LINE))
      .join("\n");
  }

  function getContentSlides(content: string): Slide[] {
    const lines = normalizeText(content)
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !line.trim().startsWith("#"));

    const slideLines = lines.reduce<string[][]>(
      (result, line) => {
        const currentSlide = result[result.length - 1];

        if (
          (/^(?:0\d|1\d)$/.test(line.trim()) ||
            line.trim().startsWith("［")) &&
          currentSlide.some(Boolean)
        ) {
          result.push([]);
        }

        result[result.length - 1].push(line);
        return result;
      },
      [[]],
    );

    return slideLines
      .map((item, index) => createSlide(item.join("\n"), index))
      .filter((slide) => slide.paragraphs.length);
  }

  function createSlide(text: string, index: number): Slide {
    const firstLine = getFirstLine(text) || "";
    const hasOrderLine = /^(?:0\d|1\d)$/.test(firstLine);
    const order = hasOrderLine
      ? firstLine
      : String(index + 1).padStart(2, "0");
    const paragraphs = getParagraphLines(
      hasOrderLine ? removeFirstLine(text) : text,
    );

    return {
      order,
      paragraphs,
    };
  }

  function getParagraphLines(text: string) {
    return normalizeText(text)
      .split(/\n\s*\n/)
      .map((paragraph) =>
        paragraph
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n"),
      )
      .filter(Boolean);
  }

  function normalizeText(text: string) {
    return text.replace(/\r\n/g, "\n");
  }

  function getFirstLine(text: string) {
    return normalizeText(text)
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
  }

  function removeFirstLine(text: string) {
    const lines = normalizeText(text).split("\n");
    const firstContentLineIndex = lines.findIndex((line) => line.trim());

    if (firstContentLineIndex === -1) {
      return "";
    }

    return lines
      .filter((_, index) => index !== firstContentLineIndex)
      .join("\n")
      .trim();
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
    fontSize: number,
    ctx: Canvas2DContext,
  ) {
    return buildCombinedLayout(slides, fontFamily, fontSize, ctx);
  }

  function buildCombinedLayout(
    slides: Slide[],
    fontFamily: string,
    fontSize: number,
    ctx: Canvas2DContext,
  ): CombinedLayout {
    const lineHeight = SECOND_THEME_BODY_LINE_HEIGHT;
    const orderBottomGap = SECOND_THEME_ORDER_BOTTOM_GAP;
    const sectionGap = SECOND_THEME_SECTION_GAP;
    const maxTextWidth =
      CANVAS_WIDTH -
      SECOND_THEME_PADDING_LEFT -
      SECOND_THEME_PADDING_RIGHT;
    const font = `normal ${fontSize}px "${fontFamily}", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
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

  function getCanvasTextBlockHeight(paragraphLines: CanvasTextLine[][]) {
    const bodyHeight = paragraphLines.reduce((total, lines, index) => {
      const gap =
        index === paragraphLines.length - 1 ? 0 : CANVAS_PARAGRAPH_GAP;

      return total + lines.length * CANVAS_LINE_HEIGHT + gap;
    }, 0);

    return CANVAS_LINE_HEIGHT + CANVAS_ORDER_BODY_GAP + bodyHeight;
  }

  function scaleCanvasValue(value: number) {
    return Math.round(value * CANVAS_SCALE);
  }

  function scaleSecondThemeValue(value: number) {
    return Math.round(value * SECOND_THEME_SCALE);
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

  function ensureRed3FontLoaded() {
    if (red3FontPromise) return red3FontPromise;

    red3FontPromise = new Promise<void>((resolve, reject) => {
      wx.loadFontFace({
        family: RED3_FONT_FAMILY,
        source: `url("${RED3_FONT_URL}")`,
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
          red3FontPromise = undefined;
          reject(error);
        },
      });
    });

    return red3FontPromise;
  }

  function ensureCombinedFontLoaded(fontOption: CombinedFontOption) {
    const cachedPromise = combinedFontPromises.get(fontOption.family);
    if (cachedPromise) return cachedPromise;

    const fontPromise = new Promise<void>((resolve, reject) => {
      wx.loadFontFace({
        family: fontOption.family,
        source: `url("${fontOption.url}")`,
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
          combinedFontPromises.delete(fontOption.family);
          reject(error);
        },
      });
    });

    combinedFontPromises.set(fontOption.family, fontPromise);
    return fontPromise;
  }

  function enqueueRender<T>(task: () => Promise<T>) {
    const run = renderChain.then(task, task);
    renderChain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
