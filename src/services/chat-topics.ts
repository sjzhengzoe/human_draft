import type { OfficialChatTopic, UserChatTopic } from "../types/chat-topics"
import { request } from "./request"

export async function listChatTopics(): Promise<{
  officialItems: OfficialChatTopic[]
  myItems: UserChatTopic[]
}> {
  const data = await request<{
    official_items: OfficialChatTopic[]
    my_items: UserChatTopic[]
  }>({ path: "/api/chat-topics" })
  return {
    officialItems: data.official_items,
    myItems: data.my_items
  }
}

export async function createUserChatTopic(content: string): Promise<UserChatTopic> {
  const data = await request<{ item: UserChatTopic }>({
    path: "/api/chat-topics/mine",
    method: "POST",
    data: { content }
  })
  return data.item
}

export async function addOfficialChatTopic(officialTopicId: string): Promise<{
  item: UserChatTopic
  created: boolean
}> {
  return request<{ item: UserChatTopic; created: boolean }>({
    path: "/api/chat-topics/mine/from-official",
    method: "POST",
    data: { official_topic_id: officialTopicId }
  })
}

export async function updateUserChatTopic(id: string, content: string): Promise<UserChatTopic> {
  const data = await request<{ item: UserChatTopic }>({
    path: `/api/chat-topics/mine/${id}`,
    method: "PUT",
    data: { content }
  })
  return data.item
}

export function deleteUserChatTopic(id: string): Promise<void> {
  return request<void>({ path: `/api/chat-topics/mine/${id}`, method: "DELETE" })
}
