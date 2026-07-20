'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 브라우저 Supabase 클라이언트(0125) — 현재 용도는 Realtime 구독(월드 채팅)뿐.
 * 인증 불필요(공개 broadcast 채널) — anon 키, 세션 저장 비활성(auth는 서버 쿠키 체계와 별개 유지).
 */
let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (_client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
