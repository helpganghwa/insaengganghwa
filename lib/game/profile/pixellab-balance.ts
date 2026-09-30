import 'server-only';

import { kstDateString } from '@/lib/kst';

import { PIXELLAB_KEY_IDXS, pixellabKeyIfSet } from './pixellab-keys';

/**
 * Pixellab 키별 잔여 사용량(관리자 아바타 생성 검수 페이지) — GET /v2/balance는 계정 정보 조회라 생성 비용이 없다.
 * 응답: 구독 생성 횟수(남은/총)와 충전 잔액(USD). 리셋 날짜는 API가 주지 않아 키별 월 결제일을 여기 둔다(각 계정 Billing 기준).
 */
export const PIXELLAB_RESET_DAY: Record<number, number> = { 1: 15, 2: 26, 3: 19 };

export type PixellabBalance = {
  idx: number;
  /** 이 배포에 키가 없으면 false(Vercel env 미설정) — 나머지 값은 비어 있다. */
  configured: boolean;
  ok: boolean;
  plan: string | null;
  remaining: number | null;
  total: number | null;
  usd: number | null;
  /** 다음 리셋 날짜(KST, YYYY-MM-DD)와 남은 일수. */
  resetDate: string;
  resetInDays: number;
};

/** 매월 day일 리셋 — 오늘(KST)이 그날이면 오늘, 지났으면 다음 달. */
export function nextResetKst(day: number, now: Date = new Date()): { date: string; inDays: number } {
  const [y, m, d] = kstDateString(now).split('-').map(Number) as [number, number, number];
  const clamp = (yy: number, mm: number) => Math.min(day, new Date(Date.UTC(yy, mm, 0)).getUTCDate()); // 짧은 달은 말일
  let ty = y;
  let tm = m;
  if (d > clamp(y, m)) {
    tm = m === 12 ? 1 : m + 1;
    ty = m === 12 ? y + 1 : y;
  }
  const td = clamp(ty, tm);
  const inDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
  return { date: `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`, inDays };
}

let cache: { at: number; v: PixellabBalance[] } | null = null;
const TTL_MS = 60_000;

/** 세 키의 잔여 사용량 — 1분 캐시(페이지를 여러 번 열어도 요청이 쌓이지 않게), 키마다 5초 타임아웃. */
export async function pixellabBalances(): Promise<PixellabBalance[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.v;
  const v = await Promise.all(
    PIXELLAB_KEY_IDXS.map(async (idx): Promise<PixellabBalance> => {
      const reset = nextResetKst(PIXELLAB_RESET_DAY[idx] ?? 1);
      const base = { idx, resetDate: reset.date, resetInDays: reset.inDays, plan: null, remaining: null, total: null, usd: null };
      const key = pixellabKeyIfSet(idx);
      if (!key) return { ...base, configured: false, ok: false };
      try {
        const r = await fetch('https://api.pixellab.ai/v2/balance', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5_000),
          cache: 'no-store',
        });
        if (!r.ok) return { ...base, configured: true, ok: false };
        const j = (await r.json()) as {
          credits?: { usd?: number };
          subscription?: { plan?: string; generations?: number; total?: number };
        };
        return {
          ...base,
          configured: true,
          ok: true,
          plan: j.subscription?.plan ?? null,
          remaining: j.subscription?.generations ?? null,
          total: j.subscription?.total ?? null,
          usd: j.credits?.usd ?? null,
        };
      } catch {
        return { ...base, configured: true, ok: false };
      }
    }),
  );
  cache = { at: Date.now(), v };
  return v;
}
