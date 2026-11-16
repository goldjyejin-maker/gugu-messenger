import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MAX_CATEGORIES } from '../types';
import type { AdapterEvent, Attachment, Category, Channel, Message, MessengerAdapter, SignInParams, User } from '../types';
import { extractMentions, uid } from '../util';

interface Row {
  id: string; channel_id: string; user_id: string; text: string; mentions: string[];
  attachments: { id: string; name: string; size: number; type: string; path: string }[];
  reactions: Record<string, string[]>; created_at: string;
}

export class SupabaseAdapter implements MessengerAdapter {
  readonly kind = 'supabase' as const;
  readonly authMode = 'email' as const;
  private sb: SupabaseClient;
  private me: User | null = null;
  private users: User[] = [];
  private urlCache = new Map<string, { url: string; exp: number }>();

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey);
  }

  private need(): User { if (!this.me) throw new Error('로그인이 필요합니다'); return this.me; }

  private async loadMe(id: string): Promise<User | null> {
    const { data } = await this.sb.from('profiles').select('id,name').eq('id', id).maybeSingle();
    this.me = data as User | null;
    return this.me;
  }

  async restoreSession() {
    const { data } = await this.sb.auth.getSession();
    return data.session ? this.loadMe(data.session.user.id) : null;
  }

  async signIn(p: SignInParams) {
    const email = p.email?.trim() ?? '';
    const password = p.password ?? '';
    if (!email || !password) throw new Error('이메일과 비밀번호를 입력하세요');
    if (p.signUp) {
      if (!p.name.trim()) throw new Error('이름을 입력하세요');
      const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { name: p.name.trim() } } });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('가입되었습니다. 이메일 인증 후 로그인하세요 (관리자가 인증 끄기를 설정하면 바로 로그인됩니다)');
      const u = await this.loadMe(data.session.user.id);
      if (!u) throw new Error('프로필을 불러오지 못했습니다');
      return u;
    }
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    const u = await this.loadMe(data.user.id);
    if (!u) throw new Error('프로필을 불러오지 못했습니다');
    return u;
  }
  async signOut() { await this.sb.auth.signOut(); this.me = null; }

  async listUsers() {
    const { data, error } = await this.sb.from('profiles').select('id,name').order('name');
    if (error) throw new Error(error.message);
    this.users = data as User[];
    return this.users;
  }

  async listChannels() {
    this.need();
    const { data, error } = await this.sb.from('channels').select('id,name,kind,category_id,channel_members(user_id)').order('created_at');
    if (error) throw new Error(error.message);
    return (data as { id: string; name: string; kind: 'channel' | 'dm'; category_id: string | null; channel_members: { user_id: string }[] }[])
      .map(c => ({ id: c.id, name: c.name, kind: c.kind, categoryId: c.category_id, memberIds: c.channel_members.map(m => m.user_id) } as Channel));
  }

  async createChannel(name: string, memberIds: string[], categoryId: string | null = null) {
    const { data, error } = await this.sb.rpc('create_channel', { p_name: name, p_members: memberIds, p_category: categoryId });
    if (error) throw new Error(error.message);
    const list = await this.listChannels();
    return list.find(c => c.id === data)!;
  }

  async listCategories() {
    const { data, error } = await this.sb.from('categories').select('id,name').order('position').order('created_at');
    if (error) throw new Error(error.message);
    return data as Category[];
  }
  async createCategory(name: string) {
    const { error } = await this.sb.rpc('create_category', { p_name: name });
    if (error) throw new Error(error.message.includes('max_categories') ? `카테고리는 최대 ${MAX_CATEGORIES}개까지 만들 수 있어요` : error.message);
  }
  async deleteCategory(id: string) {
    const { error } = await this.sb.rpc('delete_category', { p_id: id });
    if (error) throw new Error(error.message);
  }
  async setChannelCategory(channelId: string, categoryId: string | null) {
    const { error } = await this.sb.rpc('set_channel_category', { p_channel: channelId, p_category: categoryId });
    if (error) throw new Error(error.message);
  }
  async openDm(userId: string) {
    const { data, error } = await this.sb.rpc('open_dm', { p_other: userId });
    if (error) throw new Error(error.message);
    const list = await this.listChannels();
    return list.find(c => c.id === data)!;
  }

  private async signed(path: string): Promise<string> {
    const hit = this.urlCache.get(path);
    if (hit && hit.exp > Date.now()) return hit.url;
    const { data } = await this.sb.storage.from('attachments').createSignedUrl(path, 3600);
    const url = data?.signedUrl ?? '';
    this.urlCache.set(path, { url, exp: Date.now() + 50 * 60_000 });
    return url;
  }

  private async toMessage(r: Row): Promise<Message> {
    const attachments: Attachment[] = await Promise.all(
      (r.attachments ?? []).map(async a => ({ id: a.id, name: a.name, size: a.size, type: a.type, url: await this.signed(a.path) })),
    );
    return {
      id: r.id, channelId: r.channel_id, userId: r.user_id, text: r.text, createdAt: new Date(r.created_at).getTime(),
      attachments, reactions: r.reactions ?? {}, mentions: r.mentions ?? [],
    };
  }

  async listMessages(channelId: string) {
    const { data, error } = await this.sb.from('messages').select('*').eq('channel_id', channelId)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return Promise.all((data as Row[]).reverse().map(r => this.toMessage(r)));
  }

  async sendMessage(channelId: string, text: string, files: File[]) {
    const me = this.need();
    const attachments: Row['attachments'] = [];
    for (const f of files) {
      const id = uid();
      // Storage 키는 ASCII만 허용(한글 불가) → 경로는 id + 확장자, 원래 이름은 메시지의 attachments.name에 보관
      const ext = (/\.[A-Za-z0-9]{1,8}$/.exec(f.name)?.[0] ?? '').toLowerCase();
      const path = `${channelId}/${id}${ext}`;
      const { error } = await this.sb.storage.from('attachments').upload(path, f, { contentType: f.type || undefined });
      if (error) throw new Error(`파일 업로드 실패: ${error.message}`);
      attachments.push({ id, name: f.name, size: f.size, type: f.type, path });
    }
    if (!this.users.length) await this.listUsers();
    const { error } = await this.sb.from('messages').insert({
      channel_id: channelId, user_id: me.id, text, attachments, mentions: extractMentions(text, this.users),
    });
    if (error) throw new Error(error.message);
    await this.markRead(channelId);
  }

  async toggleReaction(messageId: string, emoji: string) {
    const { error } = await this.sb.rpc('toggle_reaction', { p_message: messageId, p_emoji: emoji });
    if (error) throw new Error(error.message);
  }
  async deleteMessage(messageId: string) {
    const { error } = await this.sb.from('messages').delete().eq('id', messageId);
    if (error) throw new Error(error.message);
  }

  async markRead(channelId: string) {
    const me = this.need();
    await this.sb.from('reads').upsert({ user_id: me.id, channel_id: channelId, last_read_at: new Date().toISOString() });
  }
  async unreadCounts() {
    const { data } = await this.sb.rpc('unread_counts');
    const out: Record<string, number> = {};
    (data as { channel_id: string; n: number }[] | null)?.forEach(r => { out[r.channel_id] = Number(r.n); });
    return out;
  }

  async search(query: string) {
    const q = query.trim().replace(/[%_\\]/g, m => '\\' + m);
    if (!q) return [];
    const { data, error } = await this.sb.from('messages').select('*').ilike('text', `%${q}%`)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return Promise.all((data as Row[]).map(r => this.toMessage(r)));
  }

  subscribe(cb: (e: AdapterEvent) => void) {
    const ch = this.sb.channel('gugu-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async p => cb({ type: 'message', message: await this.toMessage(p.new as Row) }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, p => cb({ type: 'reaction', messageId: (p.new as Row).id }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => cb({ type: 'reaction', messageId: '' }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members' }, () => cb({ type: 'channels' }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels' }, () => cb({ type: 'channels' }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => cb({ type: 'categories' }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => cb({ type: 'users' }))
      .subscribe();
    return () => { void this.sb.removeChannel(ch); };
  }
}
