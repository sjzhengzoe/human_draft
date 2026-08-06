import { ensureLogin } from "../../../services/auth"
import { getMediaEpisode, updateMediaEpisode } from "../../../services/media"
import type {
  MediaEpisode,
  MediaTimelineDialogue,
  MediaTimelineNote,
  MediaTimelineNoteType
} from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type StoredEpisodeEdit = {
  episode: MediaEpisode
  mediaTitle: string
  seasonName: string
}

type TimePickerValue = [number, number, number]

type EditableTimelineNote = Omit<MediaTimelineNote, "type" | "dialogues"> & {
  type: MediaTimelineNoteType
  dialogues: MediaTimelineDialogue[]
  timePickerValue: TimePickerValue
}

let timelineNoteSequence = 0
let timelineDialogueSequence = 0

const timePickerColumnSizes: TimePickerValue = [100, 60, 60]

// 微信原生 picker 没有 circular 属性。每列重复三段，并始终将选中项
// 归位到中间段，使首尾数字可以继续向两个方向滚动。
const timePickerRange = timePickerColumnSizes.map((size) =>
  Array.from({ length: size * 3 }, (_, index) => String(index % size).padStart(2, "0"))
)

const timelineNoteTypes: Array<{ value: MediaTimelineNoteType; label: string }> = [
  { value: "normal", label: "普通剧情" },
  { value: "key", label: "关键剧情" },
  { value: "quote", label: "语录" }
]

function isTimelineNoteType(value: unknown): value is MediaTimelineNoteType {
  return value === "normal" || value === "key" || value === "quote"
}

function createTimelineDialogue(speaker = "", content = ""): MediaTimelineDialogue {
  timelineDialogueSequence += 1
  return {
    id: `dialogue_${Date.now()}_${timelineDialogueSequence}`,
    speaker,
    content
  }
}

function getTimeValue(timecode: string): TimePickerValue {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d)$/.exec(timecode.trim())
  if (!match) return [0, 0, 0]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function getLoopedTimePickerValue(value: TimePickerValue): TimePickerValue {
  return value.map((part, index) => part + timePickerColumnSizes[index]) as TimePickerValue
}

function normalizeTimePickerValue(value: TimePickerValue): TimePickerValue {
  return value.map((part, index) => part % timePickerColumnSizes[index]) as TimePickerValue
}

function formatTimecode(value: TimePickerValue) {
  return value.map((part) => String(part).padStart(2, "0")).join(":")
}

function createEditableTimelineNote(note: MediaTimelineNote): EditableTimelineNote {
  const timeValue = getTimeValue(note.timecode)
  const type = isTimelineNoteType(note.type) ? note.type : "normal"
  const dialogues = Array.isArray(note.dialogues)
    ? note.dialogues.map((dialogue) => ({
        id: String(dialogue.id || createTimelineDialogue().id),
        speaker: String(dialogue.speaker || ""),
        content: String(dialogue.content || "")
      }))
    : []
  return {
    ...note,
    timecode: formatTimecode(timeValue),
    type,
    dialogues: type === "quote" && dialogues.length === 0
      ? [createTimelineDialogue("", note.content)]
      : dialogues,
    timePickerValue: getLoopedTimePickerValue(timeValue)
  }
}

function createTimelineNote(): EditableTimelineNote {
  timelineNoteSequence += 1
  return createEditableTimelineNote({
    id: `note_${Date.now()}_${timelineNoteSequence}`,
    timecode: "00:00:00",
    content: ""
  })
}

function getSubmittedText(
  values: WechatMiniprogram.IAnyObject,
  name: string,
  fallback: string
): string {
  const value = values[name]
  return typeof value === "string" ? value : fallback
}

Page({
  data: {
    id: "",
    mediaTitle: "",
    seasonName: "",
    episodeNumber: 0,
    title: "",
    plotSummary: "",
    timelineNotes: [] as EditableTimelineNote[],
    timelineNoteTypes,
    timePickerRange,
    loading: true,
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const id = String(query.id || "")
    this.setData({ id })
    this.loadPage(id)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  applyEpisode(episode: MediaEpisode) {
    this.setData({
      episodeNumber: episode.episode_number,
      title: episode.title,
      plotSummary: episode.plot_summary,
      timelineNotes: Array.isArray(episode.timeline_notes)
        ? episode.timeline_notes.map(createEditableTimelineNote)
        : []
    })
  },

  async loadPage(id: string) {
    const generation = beginAsyncPageRequest(this)
    try {
      const session = await ensureLogin()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!session.user.can_write) {
        wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
        wx.navigateBack()
        return
      }
      const stored = wx.getStorageSync("MEDIA_EPISODE_EDIT") as StoredEpisodeEdit | undefined
      if (stored?.episode.id === id) {
        this.setData({ mediaTitle: stored.mediaTitle, seasonName: stored.seasonName })
        this.applyEpisode(stored.episode)
      }
      const episode = await getMediaEpisode(id)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applyEpisode(episode)
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({
        title: "加载失败",
        content: error instanceof Error ? error.message : "无法读取单集记录",
        showCancel: false,
        success: () => isAsyncPageActive(this) && wx.navigateBack()
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ title: event.detail.value })
  },

  handleSummaryInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ plotSummary: event.detail.value })
  },

  handleAddTimelineNote() {
    if (this.data.timelineNotes.length >= 100) {
      wx.showToast({ title: "每集最多记录 100 个时间点", icon: "none" })
      return
    }
    this.setData(
      { timelineNotes: [...this.data.timelineNotes, createTimelineNote()] },
      () => wx.showToast({ title: "新增成功", icon: "success", duration: 1200 })
    )
  },

  handleTimelineTimeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.timelineNotes[index]) return
    const pickerValue = event.detail.value as number[]
    if (pickerValue.length !== 3 || pickerValue.some((value) => !Number.isInteger(value))) return
    const rawPickerValue: TimePickerValue = [pickerValue[0], pickerValue[1], pickerValue[2]]
    const timeValue = normalizeTimePickerValue(rawPickerValue)
    const timelineNotes = [...this.data.timelineNotes]
    timelineNotes[index] = {
      ...timelineNotes[index],
      timecode: formatTimecode(timeValue),
      timePickerValue: getLoopedTimePickerValue(timeValue)
    }
    this.setData({ timelineNotes })
  },

  handleTimelineTimeColumnChange(event: WechatMiniprogram.PickerColumnChange) {
    const index = Number(event.currentTarget.dataset.index)
    const column = event.detail.column
    const value = event.detail.value
    const note = this.data.timelineNotes[index]
    const columnSize = timePickerColumnSizes[column]
    if (!note || columnSize === undefined || !Number.isInteger(value)) return
    if (value >= columnSize && value < columnSize * 2) {
      note.timePickerValue[column] = value
      return
    }
    const timePickerValue = [...note.timePickerValue] as TimePickerValue
    timePickerValue[column] = columnSize + (value % columnSize)
    const timelineNotes = [...this.data.timelineNotes]
    timelineNotes[index] = { ...note, timePickerValue }
    this.setData({ timelineNotes })
  },

  handleTimelineTypeChange(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const type = String(event.currentTarget.dataset.type || "")
    if (!Number.isInteger(index) || !this.data.timelineNotes[index] || !isTimelineNoteType(type)) return
    const timelineNotes = [...this.data.timelineNotes]
    const note = timelineNotes[index]
    if (note.type === type) return
    let content = note.content
    let dialogues = note.dialogues
    if (type === "quote" && dialogues.length === 0) {
      dialogues = [createTimelineDialogue("", content)]
    } else if (note.type === "quote" && type !== "quote" && !content.trim()) {
      content = dialogues
        .map((dialogue) => `${dialogue.speaker.trim()}：${dialogue.content.trim()}`)
        .join("\n")
    }
    timelineNotes[index] = { ...note, type, content, dialogues }
    this.setData({ timelineNotes })
  },

  handleTimelineContentInput(event: WechatMiniprogram.TextareaInput) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.timelineNotes[index]) return
    // textarea 自己已经更新了显示内容。这里只同步逻辑数据，避免 setData
    // 重新下发 value 后把用户刚刚选择的光标位置推到文本末尾。
    this.data.timelineNotes[index].content = event.detail.value
  },

  handleDialogueSpeakerInput(event: WechatMiniprogram.Input) {
    const noteIndex = Number(event.currentTarget.dataset.noteIndex)
    const dialogueIndex = Number(event.currentTarget.dataset.dialogueIndex)
    const dialogue = this.data.timelineNotes[noteIndex]?.dialogues[dialogueIndex]
    if (!dialogue) return
    dialogue.speaker = event.detail.value
  },

  handleDialogueContentInput(event: WechatMiniprogram.TextareaInput) {
    const noteIndex = Number(event.currentTarget.dataset.noteIndex)
    const dialogueIndex = Number(event.currentTarget.dataset.dialogueIndex)
    const dialogue = this.data.timelineNotes[noteIndex]?.dialogues[dialogueIndex]
    if (!dialogue) return
    dialogue.content = event.detail.value
  },

  handleAddDialogue(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const note = this.data.timelineNotes[index]
    if (!note || note.type !== "quote") return
    if (note.dialogues.length >= 20) {
      wx.showToast({ title: "每个时间点最多记录 20 条对话", icon: "none" })
      return
    }
    const timelineNotes = [...this.data.timelineNotes]
    timelineNotes[index] = {
      ...note,
      dialogues: [...note.dialogues, createTimelineDialogue()]
    }
    this.setData({ timelineNotes })
  },

  handleRemoveDialogue(event: WechatMiniprogram.TouchEvent) {
    const noteIndex = Number(event.currentTarget.dataset.noteIndex)
    const dialogueIndex = Number(event.currentTarget.dataset.dialogueIndex)
    const note = this.data.timelineNotes[noteIndex]
    if (!note || note.type !== "quote" || note.dialogues.length <= 1 || !note.dialogues[dialogueIndex]) return
    const timelineNotes = [...this.data.timelineNotes]
    timelineNotes[noteIndex] = {
      ...note,
      dialogues: note.dialogues.filter((_, index) => index !== dialogueIndex)
    }
    this.setData({ timelineNotes })
  },

  handleTimelineContentBlur(event: WechatMiniprogram.TextareaBlur) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.timelineNotes[index]) return
    this.data.timelineNotes[index].content = event.detail.value
  },

  handleRemoveTimelineNote(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.timelineNotes[index]) return
    this.setData({
      timelineNotes: this.data.timelineNotes.filter((_, noteIndex) => noteIndex !== index)
    })
  },

  async handleSave(event: WechatMiniprogram.FormSubmit) {
    if (this.data.loading || this.data.saving || !this.data.id) return
    // 真机键盘的“清空全部”不一定触发 bindinput。保存时以原生 form
    // 当前收集到的值为准，避免把 JS 中尚未同步的旧文案写回数据库。
    const submittedValues = event.detail.value
    const title = getSubmittedText(submittedValues, "title", this.data.title)
    const plotSummary = getSubmittedText(submittedValues, "plot_summary", this.data.plotSummary)
    const timelineNotes = this.data.timelineNotes.map((note, noteIndex) => ({
      ...note,
      content: note.type === "quote"
        ? note.content
        : getSubmittedText(submittedValues, `timeline_content_${noteIndex}`, note.content),
      dialogues: note.type === "quote"
        ? note.dialogues.map((dialogue, dialogueIndex) => ({
            ...dialogue,
            speaker: getSubmittedText(
              submittedValues,
              `dialogue_speaker_${noteIndex}_${dialogueIndex}`,
              dialogue.speaker
            ),
            content: getSubmittedText(
              submittedValues,
              `dialogue_content_${noteIndex}_${dialogueIndex}`,
              dialogue.content
            )
          }))
        : note.dialogues
    }))
    this.data.title = title
    this.data.plotSummary = plotSummary
    this.data.timelineNotes = timelineNotes
    const invalidTime = timelineNotes.find(
      (note) => !/^\d{2}:[0-5]\d:[0-5]\d$/.test(note.timecode.trim())
    )
    if (invalidTime) {
      wx.showToast({ title: "时间需使用 01:03:09 格式", icon: "none" })
      return
    }
    if (timelineNotes.some((note) => note.type !== "quote" && !note.content.trim())) {
      wx.showToast({ title: "请填写每条剧情内容", icon: "none" })
      return
    }
    if (timelineNotes.some((note) =>
      note.type === "quote"
      && (note.dialogues.length === 0 || note.dialogues.some((dialogue) =>
        !dialogue.speaker.trim() || !dialogue.content.trim()
      ))
    )) {
      wx.showToast({ title: "请填写语录中的人物和文案", icon: "none" })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      await updateMediaEpisode(this.data.id, {
        title,
        plot_summary: plotSummary,
        timeline_notes: timelineNotes.map((note) => ({
          id: note.id,
          timecode: note.timecode.trim(),
          type: note.type,
          content: note.type === "quote" ? "" : note.content.trim(),
          dialogues: note.type === "quote"
            ? note.dialogues.map((dialogue) => ({
                id: dialogue.id,
                speaker: dialogue.speaker.trim(),
                content: dialogue.content.trim()
              }))
            : []
        }))
      })
      wx.removeStorageSync("MEDIA_EPISODE_EDIT")
      wx.hideLoading()
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "保存成功", icon: "success", duration: 1200 })
      setTimeout(() => {
        if (!isAsyncPageActive(this)) return
        this.setData({ saving: false })
        wx.navigateBack()
      }, 900)
    } catch (error) {
      wx.hideLoading()
      if (isAsyncPageActive(this)) {
        const message = error instanceof Error ? error.message.trim() : ""
        this.setData({ saving: false })
        wx.showToast({
          title: message ? `保存失败：${message}` : "保存失败，请稍后重试",
          icon: "none",
          duration: 3000
        })
      }
    }
  }
})
