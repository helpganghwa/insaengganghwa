import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { systemMode } from '@/lib/db/schema/ops';

/**
 * 점검/긴급정지 킬스위치 — system_mode 단일 행(key='global').
 *
 * 운영자가 mode를 바꿔 유저 게임 접근/쓰기를 막는다. 점검 창은 시작(scheduledFrom)·종료
 * (scheduledUntil) 둘 다 선택: 시작이 있으면 그 시각부터 자동 시작(없으면 즉시), 종료가 있으면
 * 그 시각에 자동 해제(없으면 무기한). **isAdmin은 게이트에서 예외**, 로그인은 (game) 밖이라 항상 접속.
 *
 * **결제 지급/환불처럼 '이미 일어난 일' 마무리 경로엔 쓰지 말 것**(막으면 paid-not-granted).
 * fail-open: 행 부재/조회 실패 시 live. 캐시 20s — 전환 전파 최대 20s.
 */
export type SystemModeValue = 'live' | 'read_only' | 'maintenance' | 'emergency_stop';

export type MaintenanceState = {
  mode: SystemModeValue;
  /** 시작 예정(null=즉시). */
  from: Date | null;
  /** 종료 예정(null=무기한). */
  until: Date | null;
  note: string | null;
  /** 지금 점검이 유효한가(mode!=live + 시작 도래 + 종료 미도래). */
  active: boolean;
};

const TTL_MS = 20_000;
let cache: { state: Omit<MaintenanceState, 'active'>; at: number } | null = null;

function computeActive(s: Omit<MaintenanceState, 'active'>): boolean {
  if (s.mode === 'live') return false;
  const now = Date.now();
  if (s.from && now < s.from.getTime()) return false; // 시작 전
  if (s.until && now >= s.until.getTime()) return false; // 종료 지남
  return true;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return { ...cache.state, active: computeActive(cache.state) };
  }
  try {
    const [row] = await db
      .select({
        mode: systemMode.mode,
        from: systemMode.scheduledFrom,
        until: systemMode.scheduledUntil,
        note: systemMode.note,
      })
      .from(systemMode)
      .where(eq(systemMode.key, 'global'))
      .limit(1);
    const state = {
      mode: (row?.mode ?? 'live') as SystemModeValue,
      from: row?.from ?? null,
      until: row?.until ?? null,
      note: row?.note ?? null,
    };
    cache = { state, at: now };
    return { ...state, active: computeActive(state) };
  } catch (e) {
    console.error('[system-mode] read failed — fail-open(live)', e);
    return { mode: 'live', from: null, until: null, note: null, active: false };
  }
}

/** 운영자 모드 전환(어드민). from=시작예정(null=즉시), until=종료예정(null=무기한). 캐시 즉시 갱신. */
export async function setSystemMode(
  mode: SystemModeValue,
  adminId: string,
  opts?: { from?: Date | null; until?: Date | null; note?: string | null },
): Promise<void> {
  const updatedAt = new Date();
  const from = opts?.from ?? null;
  const until = opts?.until ?? null;
  const note = opts?.note ?? null;
  await db
    .insert(systemMode)
    .values({
      key: 'global',
      mode,
      scheduledFrom: from,
      scheduledUntil: until,
      note,
      updatedBy: adminId,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: systemMode.key,
      set: { mode, scheduledFrom: from, scheduledUntil: until, note, updatedBy: adminId, updatedAt },
    });
  cache = { state: { mode, from, until, note }, at: Date.now() };
}
