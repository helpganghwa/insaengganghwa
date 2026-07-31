/**
 * 대난투 10:00 발표 cron — MELEE §7. KST 10:00 = UTC `0 1 * * *`(vercel.json).
 * 'computed' → 'revealed'(멱등) + 참가자 전원 결과 우편 + 푸시. 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { beatCron } from '@/lib/cron/heartbeat';
import { revealMelee } from '@/lib/game/melee/reveal';
import { openServerIds } from '@/lib/game/server-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // CBT 종료~출시 사이(cbt_ended)엔 정지(2026-07-31 2단계 플로우) — 유저는 접속이 막혀 있는데
  // 이 크론이 돌면 잠긴 유저에게 푸시가 가거나(보급) 심사·어드민 캐릭터끼리 유령 진행이 쌓인다.
  // 출시일 아침 크론을 켜둔 채 11:00 live 전환만 하면 되도록, 게이트를 크론 안에 둔다.
  const mode = await getMaintenanceState().catch(() => null);
  if (mode?.active && mode.mode === 'cbt_ended') {
    return Response.json({ ok: true, skipped: 'cbt_ended' });
  }
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 발표 실패가 뒤 서버 보상 우편 누락으로 번지지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        results.push({ serverId: sid, ...(await revealMelee(sid)) });
      } catch (se) {
        console.error('[melee-reveal] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    if (ok) await beatCron('melee-reveal'); // 성공 시에만 — '실행됐으나 실패'를 dead-man이 감지
    return Response.json({ ok, results, kind: 'melee-reveal' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[melee-reveal]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'melee-reveal' }, { status: 500 });
  }
}
