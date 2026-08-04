/**
 * 대난투 9시 산출 cron — MELEE §3. KST 09:00~09:55 = UTC hour0 매 5분 재시도(vercel.json).
 * 로스터(강화1회+) → CP 스냅샷 → 결정론 시뮬 → 저장(status='computed', 10:00 전 비공개).
 * 멱등((server_id, battle_date) UNIQUE)·서버 루프. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { runMelee } from '@/lib/game/melee/run';
import { openServerIds } from '@/lib/game/server-list';
import { beatCron } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 대규모 산출 여유 — Fluid Compute 한도 내 최대.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // CBT 종료~출시 사이(cbt_ended)엔 정지(2026-07-31 2단계 플로우) — 유저는 접속이 막혀 있는데
  // 이 크론이 돌면 잠긴 유저에게 푸시가 가거나(보급) 심사·어드민 캐릭터끼리 유령 진행이 쌓인다.
  // 출시일 아침 크론을 켜둔 채 11:00 live 전환만 하면 되도록, 게이트를 크론 안에 둔다.
  const mode = await getMaintenanceState().catch(() => null);
  if (mode?.active && mode.mode === 'cbt_ended') {
    await beatCron('melee-run', 'skip:cbt_ended'); // 게이트 skip도 정상 실행 — dead-man 오알림 방지
    return Response.json({ ok: true, skipped: 'cbt_ended' });
  }
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 산출 실패가 뒤 서버 미개최로 번지지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        results.push({ serverId: sid, ...(await runMelee(sid)) });
      } catch (se) {
        console.error('[melee-run] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    if (ok) await beatCron('melee-run'); // 성공(전 서버 정상)일 때만 — '실행됐으나 실패'를 dead-man이 감지하게
    return Response.json({ ok, results, kind: 'melee-run' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[melee-run]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-run' }, { status: 500 });
  }
}
