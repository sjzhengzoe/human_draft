import type { MediaEpisode, MediaSeason } from "../../types/media"

type PickerEpisode = MediaEpisode & {
  selected: boolean
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    seasons: {
      type: Array,
      value: []
    },
    currentEpisodeId: {
      type: String,
      value: ""
    }
  },
  data: {
    browsingSeasonIndex: 0,
    descending: true,
    pickerEpisodes: [] as PickerEpisode[]
  },
  observers: {
    "visible,seasons,currentEpisodeId"(visible: boolean) {
      if (!visible) return
      const seasons = this.properties.seasons as MediaSeason[]
      const currentEpisodeId = String(this.properties.currentEpisodeId || "")
      const currentSeasonIndex = seasons.findIndex((season) =>
        season.episodes.some((episode) => episode.id === currentEpisodeId)
      )
      const browsingSeasonIndex = currentSeasonIndex >= 0
        ? currentSeasonIndex
        : Math.max(0, seasons.length - 1)
      this.setData({ browsingSeasonIndex, descending: true })
      this.refreshEpisodes(browsingSeasonIndex, true)
    }
  },
  methods: {
    refreshEpisodes(browsingSeasonIndex: number, descending: boolean) {
      const seasons = this.properties.seasons as MediaSeason[]
      const currentEpisodeId = String(this.properties.currentEpisodeId || "")
      const episodes = [...(seasons[browsingSeasonIndex]?.episodes || [])]
        .sort((left, right) => descending
          ? right.episode_number - left.episode_number
          : left.episode_number - right.episode_number)
        .map((episode) => ({
          ...episode,
          selected: episode.id === currentEpisodeId
        }))
      this.setData({ pickerEpisodes: episodes })
    },

    handleCancel() {
      this.triggerEvent("cancel")
    },

    handleSeasonTap(event: WechatMiniprogram.TouchEvent) {
      const browsingSeasonIndex = Number(event.currentTarget.dataset.index)
      const seasons = this.properties.seasons as MediaSeason[]
      if (!Number.isInteger(browsingSeasonIndex) || !seasons[browsingSeasonIndex]) return
      this.setData({ browsingSeasonIndex })
      this.refreshEpisodes(browsingSeasonIndex, this.data.descending)
    },

    handleOrderTap(event: WechatMiniprogram.TouchEvent) {
      const descending = event.currentTarget.dataset.order !== "asc"
      if (descending === this.data.descending) return
      this.setData({ descending })
      this.refreshEpisodes(this.data.browsingSeasonIndex, descending)
    },

    handleEpisodeTap(event: WechatMiniprogram.TouchEvent) {
      const episodeId = String(event.currentTarget.dataset.id || "")
      const season = (this.properties.seasons as MediaSeason[])[this.data.browsingSeasonIndex]
      const episode = season?.episodes.find((item) => item.id === episodeId)
      if (!season || !episode) return
      this.triggerEvent("select", {
        episodeId: episode.id,
        episodeNumber: episode.episode_number,
        seasonId: season.id,
        seasonName: season.name
      })
    }
  }
})
