import type {
  OfficialChatTopic,
  OfficialChatTopicPagination,
  UserChatTopic
} from "../types/chat-topics"
import { publicRequest, request } from "./request"

export function listOfficialChatTopics(
  page = 1,
  pageSize = 5
): Promise<{
  items: OfficialChatTopic[]
  pagination: OfficialChatTopicPagination
}> {
  return publicRequest<{
    items: OfficialChatTopic[]
    pagination: OfficialChatTopicPagination
  }>({ path: `/api/chat-topics/official?page=${page}&page_size=${pageSize}` })
}

export async function listChatTopics(page = 1, pageSize = 5): Promise<{
  officialItems: OfficialChatTopic[]
  officialPagination: OfficialChatTopicPagination
  myItems: UserChatTopic[]
}> {
  const data = await request<{
    official_items: OfficialChatTopic[]
    official_pagination: OfficialChatTopicPagination
    my_items: UserChatTopic[]
  }>({ path: `/api/chat-topics?page=${page}&page_size=${pageSize}` })
  return {
    officialItems: data.official_items,
    officialPagination: data.official_pagination,
    myItems: data.my_items
  }
}

export async function listHiddenOfficialChatTopics(
  page = 1,
  pageSize = 5
): Promise<{
  items: OfficialChatTopic[]
  pagination: OfficialChatTopicPagination
}> {
  return request<{
    items: OfficialChatTopic[]
    pagination: OfficialChatTopicPagination
  }>({ path: `/api/chat-topics/official/hidden?page=${page}&page_size=${pageSize}` })
}

export function restoreOfficialChatTopic(id: string): Promise<void> {
  return request<void>({
    path: `/api/chat-topics/official/${id}/hide`,
    method: "DELETE"
  })
}

export async function createUserChatTopic(content: string): Promise<UserChatTopic> {
  const data = await request<{ item: UserChatTopic }>({
    path: "/api/chat-topics/mine",
    method: "POST",
    data: { content }
  })
  return data.item
}

export async function createOfficialChatTopic(content: string): Promise<OfficialChatTopic> {
  const data = await request<{ item: OfficialChatTopic }>({
    path: "/api/chat-topics/official",
    method: "POST",
    data: { content }
  })
  return data.item
}

export async function updateOfficialChatTopic(
  id: string,
  content: string
): Promise<OfficialChatTopic> {
  const data = await request<{ item: OfficialChatTopic }>({
    path: `/api/chat-topics/official/${id}`,
    method: "PUT",
    data: { content }
  })
  return data.item
}

export function deleteOfficialChatTopic(id: string): Promise<void> {
  return request<void>({ path: `/api/chat-topics/official/${id}`, method: "DELETE" })
}

export function hideOfficialChatTopic(id: string): Promise<void> {
  return request<void>({
    path: `/api/chat-topics/official/${id}/dislike`,
    method: "POST"
  })
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
