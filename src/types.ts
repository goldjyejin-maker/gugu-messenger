export interface User { id: string; name: string }
export interface Channel {
  id: string;
  name: string;
  kind: 'channel' | 'dm';
  memberIds: string[];
}
export interface Attachment { id: string; name: string; size: number; type: string; url: string }
export interface Message {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  createdAt: number;
  attachments: Attachment[];
  /** 이모지 -> 반응한 사용자 id 목록 */
  reactions: Record<string, string[]>;
  mentions: string[];
}
export type AdapterEvent =
  | { type: 'message'; message: Message }
  | { type: 'reaction'; messageId: string }
  | { type: 'channels' }
  | { type: 'users' }
  | { type: 'read' };

export interface SignInParams { name: string; email?: string; password?: string; signUp?: boolean }

/**
 * 화면(UI)은 이 인터페이스만 사용한다.
 * MockAdapter(로컬 목업) / SupabaseAdapter(실제 연동) 중 환경변수에 따라 교체된다.
 */
export interface MessengerAdapter {
  readonly kind: 'mock' | 'supabase';
  readonly authMode: 'name' | 'email';
  restoreSession(): Promise<User | null>;
  signIn(p: SignInParams): Promise<User>;
  signOut(): Promise<void>;

  listUsers(): Promise<User[]>;
  listChannels(): Promise<Channel[]>;
  createChannel(name: string, memberIds: string[]): Promise<Channel>;
  openDm(userId: string): Promise<Channel>;

  listMessages(channelId: string): Promise<Message[]>;
  sendMessage(channelId: string, text: string, files: File[]): Promise<void>;
  toggleReaction(messageId: string, emoji: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;

  markRead(channelId: string): Promise<void>;
  unreadCounts(): Promise<Record<string, number>>;
  search(query: string): Promise<Message[]>;

  subscribe(cb: (e: AdapterEvent) => void): () => void;
}
