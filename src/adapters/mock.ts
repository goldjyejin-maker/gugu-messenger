import { MAX_CATEGORIES } from '../types';
import type { AdapterEvent, Attachment, Category, Channel, Message, MessengerAdapter, SignInParams, User } from '../types';
import { extractMentions, uid } from '../util';

/**
 * 로컬 목업: 서버 없이 브라우저(localStorage + IndexedDB)만으로 동작.
 * 같은 브라우저의 다른 탭은 BroadcastChannel로 실시간 동기화되므로
 * 탭 두 개에서 다른 이름으로 로그인하면 대화를 시연해 볼 수 있다.
 * (세션은 sessionStorage에 두어 탭마다 다른 사용자로 로그인 가능)
 */
interface State {
  users: User[];
  categories?: Category[];
  channels: Channel[];
  messages: Message[];
  reads: Record<string, Record<string, number>>; // userId -> channelId -> 마지막으로 읽은 시각
}
const KEY = 'gugu.mock.v1';
const SESSION = 'gugu.mock.me';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* 손상된 데이터는 초기화 */ }
  return {
    users: [],
    channels: [
      { id: 'ch-notice', name: '공지사항', kind: 'channel', memberIds: [] },
      { id: 'ch-free', name: '자유게시판', kind: 'channel', memberIds: [] },
    ],
    messages: [],
    reads: {},
  };
}

// ---- 첨부 파일은 IndexedDB에 저장 (localStorage 용량 한계 회피) ----
const dbOpen = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('gugu-files', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('f');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function putBlob(id: string, b: Blob) {
  const db = await dbOpen();
  await new Promise<void>((res, rej) => {
    const t = db.transaction('f', 'readwrite'); t.objectStore('f').put(b, id);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const q = db.transaction('f').objectStore('f').get(id);
    q.onsuccess = () => res(q.result as Blob | undefined); q.onerror = () => rej(q.error);
  });
}

export class MockAdapter implements MessengerAdapter {
  readonly kind = 'mock' as const;
  readonly authMode = 'name' as const;
  private state = load();
  private me: User | null = null;
  private bc = new BroadcastChannel('gugu-mock');
  private listeners = new Set<(e: AdapterEvent) => void>();
  private urlCache = new Map<string, string>();

  constructor() {
    this.bc.onmessage = ev => {
      this.state = load(); // 다른 탭이 저장한 최신 상태로 갱신
      this.emitLocal(ev.data as AdapterEvent);
    };
  }

  private save() { localStorage.setItem(KEY, JSON.stringify(this.state)); }
  private emitLocal(e: AdapterEvent) { this.listeners.forEach(l => l(e)); }
  private emit(e: AdapterEvent) { this.save(); this.bc.postMessage(e); this.emitLocal(e); }
  private need(): User { if (!this.me) throw new Error('로그인이 필요합니다'); return this.me; }

  async restoreSession() {
    this.state = load();
    const id = sessionStorage.getItem(SESSION);
    this.me = this.state.users.find(u => u.id === id) ?? null;
    return this.me;
  }

  async signIn(p: SignInParams) {
    this.state = load();
    const name = p.name.trim();
    if (!name) throw new Error('이름을 입력하세요');
    let u = this.state.users.find(x => x.name === name);
    if (!u) {
      u = { id: uid(), name };
      this.state.users.push(u);
      this.state.channels.filter(c => c.kind === 'channel').forEach(c => c.memberIds.push(u!.id));
      this.emit({ type: 'users' });
    }
    this.me = u;
    sessionStorage.setItem(SESSION, u.id);
    return u;
  }
  async signOut() { sessionStorage.removeItem(SESSION); this.me = null; }

  async listUsers() { this.state = load(); return [...this.state.users]; }
  async listChannels() {
    const me = this.need();
    this.state = load();
    return this.state.channels.filter(c => c.memberIds.includes(me.id));
  }
  async createChannel(name: string, memberIds: string[], categoryId: string | null = null) {
    const me = this.need();
    this.state = load();
    const c: Channel = { id: uid(), name: name.trim(), kind: 'channel', memberIds: [...new Set([me.id, ...memberIds])], categoryId };
    this.state.channels.push(c);
    this.emit({ type: 'channels' });
    return c;
  }

  async listCategories() { this.state = load(); return [...(this.state.categories ?? [])]; }
  async createCategory(name: string) {
    this.need();
    this.state = load();
    const cats = (this.state.categories ??= []);
    if (!name.trim()) throw new Error('카테고리 이름을 입력하세요');
    if (cats.length >= MAX_CATEGORIES) throw new Error(`카테고리는 최대 ${MAX_CATEGORIES}개까지 만들 수 있어요`);
    cats.push({ id: uid(), name: name.trim() });
    this.emit({ type: 'categories' });
  }
  async renameCategory(id: string, name: string) {
    this.need();
    this.state = load();
    if (!name.trim()) throw new Error('카테고리 이름을 입력하세요');
    const c = (this.state.categories ?? []).find(x => x.id === id);
    if (c) c.name = name.trim();
    this.emit({ type: 'categories' });
  }
  async deleteCategory(id: string) {
    this.need();
    this.state = load();
    this.state.categories = (this.state.categories ?? []).filter(c => c.id !== id);
    this.state.channels.forEach(c => { if (c.categoryId === id) c.categoryId = null; });
    this.emit({ type: 'categories' });
  }
  async setChannelCategory(channelId: string, categoryId: string | null) {
    this.need();
    this.state = load();
    const c = this.state.channels.find(x => x.id === channelId);
    if (c) c.categoryId = categoryId;
    this.emit({ type: 'channels' });
  }
  async openDm(userId: string) {
    const me = this.need();
    this.state = load();
    const ids = [me.id, userId].sort();
    let c = this.state.channels.find(x => x.kind === 'dm' && x.memberIds.length === ids.length && ids.every(i => x.memberIds.includes(i)));
    if (!c) {
      c = { id: uid(), name: '', kind: 'dm', memberIds: ids };
      this.state.channels.push(c);
      this.emit({ type: 'channels' });
    }
    return c;
  }

  private async hydrate(m: Message): Promise<Message> {
    const attachments: Attachment[] = [];
    for (const a of m.attachments) {
      let url = this.urlCache.get(a.id);
      if (!url) {
        const b = await getBlob(a.id);
        if (b) { url = URL.createObjectURL(b); this.urlCache.set(a.id, url); }
      }
      attachments.push({ ...a, url: url ?? '' });
    }
    return { ...m, attachments };
  }

  async listMessages(channelId: string) {
    this.state = load();
    const list = this.state.messages.filter(m => m.channelId === channelId).sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(list.map(m => this.hydrate(m)));
  }

  async sendMessage(channelId: string, text: string, files: File[]) {
    const me = this.need();
    this.state = load();
    const attachments: Attachment[] = [];
    for (const f of files) {
      const id = uid();
      await putBlob(id, f);
      attachments.push({ id, name: f.name, size: f.size, type: f.type, url: '' });
    }
    const msg: Message = {
      id: uid(), channelId, userId: me.id, text, createdAt: Date.now(), attachments, reactions: {},
      mentions: extractMentions(text, this.state.users),
    };
    this.state.messages.push(msg);
    this.state.reads[me.id] = { ...(this.state.reads[me.id] ?? {}), [channelId]: msg.createdAt };
    this.emit({ type: 'message', message: msg });
  }

  async toggleReaction(messageId: string, emoji: string) {
    const me = this.need();
    this.state = load();
    const m = this.state.messages.find(x => x.id === messageId);
    if (!m) return;
    const set = new Set(m.reactions[emoji] ?? []);
    set.has(me.id) ? set.delete(me.id) : set.add(me.id);
    if (set.size) m.reactions[emoji] = [...set]; else delete m.reactions[emoji];
    this.emit({ type: 'reaction', messageId });
  }

  async deleteMessage(messageId: string) {
    const me = this.need();
    this.state = load();
    const m = this.state.messages.find(x => x.id === messageId);
    if (!m || m.userId !== me.id) return; // 본인 메시지만 삭제
    this.state.messages = this.state.messages.filter(x => x.id !== messageId);
    this.emit({ type: 'reaction', messageId });
  }

  async markRead(channelId: string) {
    const me = this.need();
    this.state = load();
    this.state.reads[me.id] = { ...(this.state.reads[me.id] ?? {}), [channelId]: Date.now() };
    this.save();
    this.emitLocal({ type: 'read' });
  }
  async unreadCounts() {
    const me = this.need();
    this.state = load();
    const out: Record<string, number> = {};
    for (const c of this.state.channels.filter(c => c.memberIds.includes(me.id))) {
      const last = this.state.reads[me.id]?.[c.id] ?? 0;
      const n = this.state.messages.filter(m => m.channelId === c.id && m.createdAt > last && m.userId !== me.id).length;
      if (n) out[c.id] = n;
    }
    return out;
  }

  async search(query: string) {
    const me = this.need();
    this.state = load();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const mine = new Set(this.state.channels.filter(c => c.memberIds.includes(me.id)).map(c => c.id));
    const hits = this.state.messages
      .filter(m => mine.has(m.channelId) && (m.text.toLowerCase().includes(q) || m.attachments.some(a => a.name.toLowerCase().includes(q))))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    return Promise.all(hits.map(m => this.hydrate(m)));
  }

  subscribe(cb: (e: AdapterEvent) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
}
