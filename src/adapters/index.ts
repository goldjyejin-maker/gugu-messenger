import type { MessengerAdapter } from '../types';
import { MockAdapter } from './mock';
import { SupabaseAdapter } from './supabase';

/** .env 에 Supabase 값이 있으면 실제 연동, 없으면 로컬 목업 */
export function createAdapter(): MessengerAdapter {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? new SupabaseAdapter(url, key) : new MockAdapter();
}
