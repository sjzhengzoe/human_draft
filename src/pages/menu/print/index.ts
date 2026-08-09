import { APP_FONTS } from "../../../config/fonts"
import { ensureLogin } from "../../../services/auth"
import { loadAppFont } from "../../../services/font-loader"
import { listCategories, listDishes, updatePrintStatus } from "../../../services/menu"
import type { Category, Dish } from "../../../types/api"
import { MENU_PRINT_COLORS } from "../../../styles/colors"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type PrintDish = Dish & { selectionOrder: number }

type PrintStatusFilter = "all" | "printed" | "unprinted"

type CanvasImage = {
  src: string
  width: number
  height: number
  onload: (() => void) | null
  onerror: ((error: unknown) => void) | null
}

type Canvas2DContext = {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  textAlign: "left" | "center" | "right"
  textBaseline: "top" | "middle" | "bottom" | "alphabetic"
  clearRect: (x: number, y: number, width: number, height: number) => void
  fillRect: (x: number, y: number, width: number, height: number) => void
  drawImage: (image: CanvasImage, x: number, y: number, width: number, height: number) => void
  fillText: (text: string, x: number, y: number, maxWidth?: number) => void
  measureText: (text: string) => { width: number }
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  stroke: () => void
}

type Canvas2DNode = {
  width: number
  height: number
  getContext: (contextId: "2d") => Canvas2DContext
  createImage: () => CanvasImage
}

const CANVAS_ID = "menuPrintCanvas"
const A4_WIDTH = 3508
const A4_HEIGHT = 2480
const CARD_WIDTH = 1748
const CARD_HEIGHT = 1240
const CARD_OFFSET_X = (A4_WIDTH - CARD_WIDTH * 2) / 2
const WEB_ASSET_ORIGIN = "https://gufeifei.cn"
const DISH_FONT_FAMILY = APP_FONTS.ui.family
const META_FONT_FAMILY = APP_FONTS.lantingSemibold.family
const BASIC_A6_BACKGROUND_URL = encodeURI(
  `${WEB_ASSET_ORIGIN}/菜谱背景图/基础极简01.png`
)
const CUT_MARK_LENGTH = (2.5 * 300) / 25.4
const CUT_MARK_CENTER_HALF_LENGTH = CUT_MARK_LENGTH / 2
const CUT_MARK_LINE_WIDTH = (0.25 * 300) / 25.4
const CUT_MARK_EDGE_INSET = (5 * 300) / 25.4
const DISH_IMAGE_X = Math.round((CARD_WIDTH * 43) / 148)
const DISH_IMAGE_Y = Math.round((CARD_HEIGHT * 13) / 105)
const DISH_IMAGE_WIDTH = Math.round((CARD_WIDTH * 78) / 148)
const DISH_IMAGE_HEIGHT = Math.round((CARD_HEIGHT * 52) / 105)
const CAPTION_X = DISH_IMAGE_X
const CAPTION_Y = Math.round((CARD_HEIGHT * 70) / 105)
const CAPTION_WIDTH = DISH_IMAGE_WIDTH
const CAPTION_HEIGHT = Math.round((CARD_HEIGHT * 26) / 105)
const EYEBROW_FONT_SIZE = Math.round((1.9 * 300) / 25.4)
const DISH_NAME_FONT_SIZE = Math.round((4.4 * 300) / 25.4)
const META_FONT_SIZE = EYEBROW_FONT_SIZE
const EYEBROW_BOTTOM_MARGIN = (1.9 * 300) / 25.4
const META_TOP_MARGIN = (2.1 * 300) / 25.4
const DISH_NAME_LINE_HEIGHT = DISH_NAME_FONT_SIZE * 1.15

function downloadCanvasAsset(url: string, errorMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(result) {
        if (result.statusCode >= 200 && result.statusCode < 300) resolve(result.tempFilePath)
        else reject(new Error(errorMessage))
      },
      fail: () => reject(new Error(errorMessage))
    })
  })
}

async function ensurePrintFontsLoaded(): Promise<void> {
  try {
    await Promise.all([
      loadAppFont(APP_FONTS.ui),
      loadAppFont(APP_FONTS.lantingSemibold)
    ])
  } catch {
    throw new Error("Web 菜单字体加载失败，请检查网络后重试")
  }
}

function loadCanvasImage(canvas: Canvas2DNode, src: string): Promise<CanvasImage> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function drawImageContain(
  context: Canvas2DContext,
  image: CanvasImage,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const sourceRatio = image.width / image.height
  const targetRatio = width / height
  let drawWidth = width
  let drawHeight = height
  if (sourceRatio > targetRatio) drawHeight = width / sourceRatio
  else drawWidth = height * sourceRatio
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  )
}

function addCornerCutMarkPath(
  context: Canvas2DContext,
  x: number,
  y: number,
  horizontalDirection: -1 | 1,
  verticalDirection: -1 | 1
): void {
  context.moveTo(x, y)
  context.lineTo(x + CUT_MARK_LENGTH * horizontalDirection, y)
  context.moveTo(x, y)
  context.lineTo(x, y + CUT_MARK_LENGTH * verticalDirection)
}

function fitText(context: Canvas2DContext, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  const ellipsis = "…"
  let fitted = text
  while (fitted && context.measureText(`${fitted}${ellipsis}`).width > maxWidth) {
    fitted = fitted.slice(0, -1)
  }
  return `${fitted}${ellipsis}`
}

function drawCenteredLetterSpacedText(
  context: Canvas2DContext,
  text: string,
  centerX: number,
  centerY: number,
  letterSpacing: number
): void {
  const characterWidths = Array.from(text, (character) => context.measureText(character).width)
  const totalWidth =
    characterWidths.reduce((total, width) => total + width, 0) +
    letterSpacing * Math.max(0, characterWidths.length - 1)
  let x = centerX - totalWidth / 2
  context.textAlign = "left"
  Array.from(text).forEach((character, index) => {
    context.fillText(character, x, centerY)
    x += characterWidths[index] + letterSpacing
  })
  context.textAlign = "center"
}

function drawWebCaption(
  context: Canvas2DContext,
  dish: Dish,
  cardX: number,
  cardY: number
): void {
  const centerX = cardX + CAPTION_X + CAPTION_WIDTH / 2
  const groupHeight =
    EYEBROW_FONT_SIZE +
    EYEBROW_BOTTOM_MARGIN +
    DISH_NAME_LINE_HEIGHT +
    META_TOP_MARGIN +
    META_FONT_SIZE
  const groupTop = cardY + CAPTION_Y + (CAPTION_HEIGHT - groupHeight) / 2
  const eyebrowY = groupTop + EYEBROW_FONT_SIZE / 2
  const dishNameY =
    groupTop + EYEBROW_FONT_SIZE + EYEBROW_BOTTOM_MARGIN + DISH_NAME_LINE_HEIGHT / 2
  const metaY =
    groupTop +
    EYEBROW_FONT_SIZE +
    EYEBROW_BOTTOM_MARGIN +
    DISH_NAME_LINE_HEIGHT +
    META_TOP_MARGIN +
    META_FONT_SIZE / 2

  context.textBaseline = "middle"
  context.font = `600 ${EYEBROW_FONT_SIZE}px "${META_FONT_FAMILY}"`
  context.fillStyle = MENU_PRINT_COLORS.overlay
  drawCenteredLetterSpacedText(
    context,
    "TODAY'S PICK",
    centerX,
    eyebrowY,
    EYEBROW_FONT_SIZE * 0.16
  )

  context.font = `normal ${DISH_NAME_FONT_SIZE}px "${DISH_FONT_FAMILY}"`
  context.fillStyle = MENU_PRINT_COLORS.ink
  context.textAlign = "center"
  context.fillText(fitText(context, dish.name, CAPTION_WIDTH), centerX, dishNameY)

  context.font = `600 ${META_FONT_SIZE}px "${META_FONT_FAMILY}"`
  context.fillStyle = MENU_PRINT_COLORS.mutedInk
  drawCenteredLetterSpacedText(
    context,
    `${dish.category?.name || "菜单"} · MENU IDEA`,
    centerX,
    metaY,
    META_FONT_SIZE * 0.08
  )
}

Page({
  data: {
    categories: [] as Category[],
    dishes: [] as PrintDish[],
    activeCategoryId: "",
    activePrintStatus: "all" as PrintStatusFilter,
    selectedIds: [] as string[],
    selectedDishes: [] as Dish[],
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    generating: false,
    updatingPrinted: false,
    outputPath: "",
    errorMessage: ""
  },

  onLoad() {
    activateAsyncPage(this)
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadData() {
    const generation = beginAsyncPageRequest(this)
    const activeCategoryId = this.data.activeCategoryId
    const activePrintStatus = this.data.activePrintStatus
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const session = await ensureLogin()
      const [categories, dishes] = await Promise.all([
        listCategories(),
        listDishes({
          category_id: activeCategoryId || undefined,
          record_type: "home",
          printed:
            activePrintStatus === "all"
              ? undefined
              : activePrintStatus === "printed",
          sort: "custom",
          page_size: 100
        })
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const selectedIds = this.data.selectedIds
      this.setData({
        categories,
        dishes: dishes.map((dish) => ({
          ...dish,
          selectionOrder: selectedIds.indexOf(dish.id) + 1
        })),
        canWrite: session.user.can_write
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "菜单加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.contentLoading || this.data.generating || this.data.updatingPrinted) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id === this.data.activeCategoryId) return
    this.setData({ activeCategoryId: id }, () => this.loadData())
  },

  handlePrintStatusTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.contentLoading || this.data.generating || this.data.updatingPrinted) return
    const status = String(event.currentTarget.dataset.status || "")
    if (status !== "all" && status !== "printed" && status !== "unprinted") return
    if (status === this.data.activePrintStatus) return
    this.setData({ activePrintStatus: status }, () => this.loadData())
  },

  handleDishTap(event: WechatMiniprogram.TouchEvent) {
    if (
      this.data.loading ||
      this.data.contentLoading ||
      this.data.generating ||
      this.data.updatingPrinted
    ) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    const selectedIds = [...this.data.selectedIds]
    const selectedDishes = [...this.data.selectedDishes]
    const index = selectedIds.indexOf(id)
    if (index >= 0) {
      selectedIds.splice(index, 1)
      selectedDishes.splice(index, 1)
    } else if (selectedIds.length < 4) {
      const dish = this.data.dishes.find((item) => item.id === id)
      if (!dish) return
      selectedIds.push(id)
      selectedDishes.push(dish)
    }
    else {
      wx.showToast({ title: "一次最多选择四张", icon: "none" })
      return
    }
    this.setData({
      selectedIds,
      selectedDishes,
      dishes: this.data.dishes.map((dish) => ({
        ...dish,
        selectionOrder: selectedIds.indexOf(dish.id) + 1
      })),
      outputPath: ""
    })
  },

  getPrintCanvas(): Promise<Canvas2DNode> {
    return new Promise((resolve, reject) => {
      this.createSelectorQuery()
        .select(`#${CANVAS_ID}`)
        .node((result) => {
          if (result?.node) resolve(result.node as Canvas2DNode)
          else reject(new Error("打印画布初始化失败"))
        })
        .exec()
    })
  },

  canvasToTempFilePath(canvas: Canvas2DNode): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        width: A4_WIDTH,
        height: A4_HEIGHT,
        destWidth: A4_WIDTH,
        destHeight: A4_HEIGHT,
        fileType: "png",
        quality: 1,
        success: (result) => resolve(result.tempFilePath),
        fail: reject
      })
    })
  },

  async handleGenerate() {
    if (
      this.data.selectedIds.length !== 4 ||
      this.data.contentLoading ||
      this.data.generating ||
      this.data.updatingPrinted
    ) return
    const selected = this.data.selectedDishes
    if (selected.length !== 4) {
      wx.showToast({ title: "请重新选择四张菜品", icon: "none" })
      return
    }

    this.setData({ generating: true })
    wx.showLoading({ title: "生成打印图", mask: true })
    try {
      await ensurePrintFontsLoaded()
      if (!isAsyncPageActive(this)) return
      const assetPaths = await Promise.all([
        downloadCanvasAsset(
          BASIC_A6_BACKGROUND_URL,
          "基础极简菜单背景加载失败，请检查网络后重试"
        ),
        ...selected.map((dish) =>
          downloadCanvasAsset(dish.image_url, `菜品“${dish.name}”图片下载失败`)
        )
      ])
      if (!isAsyncPageActive(this)) return

      const canvas = await this.getPrintCanvas()
      if (!isAsyncPageActive(this)) return
      const context = canvas.getContext("2d")
      canvas.width = A4_WIDTH
      canvas.height = A4_HEIGHT
      context.clearRect(0, 0, A4_WIDTH, A4_HEIGHT)
      context.fillStyle = MENU_PRINT_COLORS.paper
      context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT)

      const [backgroundImage, ...dishImages] = await Promise.all(
        assetPaths.map((path) => loadCanvasImage(canvas, path))
      )
      if (!isAsyncPageActive(this)) return

      for (let index = 0; index < selected.length; index += 1) {
        const dish = selected[index]
        const column = index % 2
        const row = Math.floor(index / 2)
        const cardX = CARD_OFFSET_X + column * CARD_WIDTH
        const cardY = row * CARD_HEIGHT
        context.drawImage(backgroundImage, cardX, cardY, CARD_WIDTH, CARD_HEIGHT)
        drawImageContain(
          context,
          dishImages[index],
          cardX + DISH_IMAGE_X,
          cardY + DISH_IMAGE_Y,
          DISH_IMAGE_WIDTH,
          DISH_IMAGE_HEIGHT
        )
        drawWebCaption(context, dish, cardX, cardY)
      }

      context.strokeStyle = MENU_PRINT_COLORS.border
      context.lineWidth = CUT_MARK_LINE_WIDTH
      context.beginPath()
      context.moveTo(CARD_OFFSET_X + CARD_WIDTH, CUT_MARK_EDGE_INSET)
      context.lineTo(CARD_OFFSET_X + CARD_WIDTH, CUT_MARK_EDGE_INSET + CUT_MARK_LENGTH)
      context.moveTo(CARD_OFFSET_X + CARD_WIDTH, A4_HEIGHT - CUT_MARK_EDGE_INSET - CUT_MARK_LENGTH)
      context.lineTo(CARD_OFFSET_X + CARD_WIDTH, A4_HEIGHT - CUT_MARK_EDGE_INSET)
      context.moveTo(CUT_MARK_EDGE_INSET, CARD_HEIGHT)
      context.lineTo(CUT_MARK_EDGE_INSET + CUT_MARK_LENGTH, CARD_HEIGHT)
      context.moveTo(A4_WIDTH - CUT_MARK_EDGE_INSET - CUT_MARK_LENGTH, CARD_HEIGHT)
      context.lineTo(A4_WIDTH - CUT_MARK_EDGE_INSET, CARD_HEIGHT)
      context.moveTo(
        CARD_OFFSET_X + CARD_WIDTH,
        CARD_HEIGHT - CUT_MARK_CENTER_HALF_LENGTH
      )
      context.lineTo(
        CARD_OFFSET_X + CARD_WIDTH,
        CARD_HEIGHT + CUT_MARK_CENTER_HALF_LENGTH
      )
      context.moveTo(
        CARD_OFFSET_X + CARD_WIDTH - CUT_MARK_CENTER_HALF_LENGTH,
        CARD_HEIGHT
      )
      context.lineTo(
        CARD_OFFSET_X + CARD_WIDTH + CUT_MARK_CENTER_HALF_LENGTH,
        CARD_HEIGHT
      )
      addCornerCutMarkPath(context, CARD_OFFSET_X, 0, 1, 1)
      addCornerCutMarkPath(context, CARD_OFFSET_X + CARD_WIDTH * 2, 0, -1, 1)
      addCornerCutMarkPath(context, CARD_OFFSET_X, A4_HEIGHT, 1, -1)
      addCornerCutMarkPath(
        context,
        CARD_OFFSET_X + CARD_WIDTH * 2,
        A4_HEIGHT,
        -1,
        -1
      )
      context.stroke()

      const outputPath = await this.canvasToTempFilePath(canvas)
      if (!isAsyncPageActive(this)) return
      this.setData({ outputPath })
      wx.previewImage({ urls: [outputPath] })
    } catch (error) {
      console.error("生成打印图失败", error)
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "生成失败",
          icon: "none"
        })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ generating: false })
    }
  },

  handlePreview() {
    if (this.data.contentLoading || this.data.updatingPrinted) return
    if (this.data.outputPath) wx.previewImage({ urls: [this.data.outputPath] })
  },

  handleSave() {
    if (this.data.contentLoading || this.data.updatingPrinted) return
    if (!this.data.outputPath) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.outputPath,
      success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
      fail: () => wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" })
    })
  },

  async handleConfirmPrinted() {
    if (
      !this.data.canWrite ||
      !this.data.outputPath ||
      this.data.selectedIds.length !== 4 ||
      this.data.contentLoading ||
      this.data.updatingPrinted
    ) return
    const selectedIds = [...this.data.selectedIds]
    this.setData({ updatingPrinted: true })
    wx.showLoading({ title: "更新状态" })
    try {
      await updatePrintStatus(selectedIds, true)
      if (!isAsyncPageActive(this)) return
      this.setData({ selectedIds: [], selectedDishes: [], outputPath: "" })
      await this.loadData()
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: "已标记为打印", icon: "success" })
      }
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "状态更新失败",
          icon: "none"
        })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ updatingPrinted: false })
    }
  },

  handleRetry() {
    if (this.data.generating || this.data.updatingPrinted) return
    this.loadData()
  }
})
