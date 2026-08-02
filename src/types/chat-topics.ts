export type OfficialChatTopic = {
  id: string
  content: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type UserChatTopic = {
  id: string
  official_topic_id: string | null
  content: string
  created_at: string
  updated_at: string
}

export type OfficialChatTopicView = OfficialChatTopic & {
  is_added: boolean
}
