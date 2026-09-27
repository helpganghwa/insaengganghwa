import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { systemMode } from '@/lib/db/schema/ops';

/**
 * 아바타 생성 일시 중지 스위치 — system_mode의 key='avatar_gen' 행(전역 점검과 같은 표, 다른 키).
 *
 * 외부 생성 서비스(Pixellab) 장애 때 새 생성 요청만 막는다. 이미 들어간 잡은 그대로 진행되고,
 * 실패하면 기존 경로(markFailedAndRefund·정체 스윕)가 환불한다. mode='live'면 열림, 그 밖의 값이면 중지.
 * fail-open: 행 부재·조회 실패면 열림. 캐시 15s — 전환 전파 최대 15s.
 */
const KEY = 'avatar_gen';
const TTL_MS = 15_000;

export type AvatarGenPause = { paused: boolean; note: string | null };

let cache: { state: AvatarGenPause; at: number } | null = null;

export async function getAvatarGenPause(): Promise<AvatarGenPause> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.state;
  try {
    const [row] = await db
      .select({ mode: systemMode.mode, note: systemMode.note })
      .from(systemMode)
      .where(eq(systemMode.key, KEY))
      .limit(1);
    const state = { paused: !!row && row.mode !== 'live', note: row?.note ?? null };
    cache = { state, at: now };
    return state;
  } catch (e) {
    console.error('[avatar-gen-pause] read failed — fail-open', e);
    return { paused: false, note: null };
  }
}

/** 어드민 전환. 캐시 즉시 갱신(이 인스턴스), 다른 인스턴스는 TTL 안에 반영. */
export async function setAvatarGenPause(paused: boolean, adminId: string, note: string | null): Promise<void> {
  const mode = paused ? 'maintenance' : 'live';
  const updatedAt = new Date();
  await db
    .insert(systemMode)
    .values({ key: KEY, mode, note, updatedBy: adminId, updatedAt })
    .onConflictDoUpdate({ target: systemMode.key, set: { mode, note, updatedBy: adminId, updatedAt } });
  cache = { state: { paused, note }, at: Date.now() };
}
