import { authedFetch } from "./api";
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientNonce: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}
export interface Conversation {
  isDirect: boolean;
  id: string;
  itemId: number | null;
  itemUnavailable: boolean;
  item: { title: string; iconKey: string; imageUrl: string | null; switchiesPerDay: number } | null;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  blocked: boolean;
  blockedByMe: boolean;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessage: { content: string; senderId: string; createdAt: string } | null;
}
export interface InboxPage {
  conversations: Conversation[];
  unreadCount: number;
  nextCursor: string | null;
}
export interface HistoryPage {
  messages: ChatMessage[];
  hasMore: boolean;
}
export async function messagingApi<T>(
  getToken: () => Promise<string | null>,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await authedFetch(
    `/api/messaging${path}`,
    getToken,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Messaging is unavailable. Please try again.");
  return data as T;
}
