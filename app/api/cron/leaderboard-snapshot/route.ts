/**
 * 리더보드 정합 재계산 cron — v2 증분화(2026-07-07) 후 역할 축소: 실시간 값은 쓰기 시점
 * 증분(lib/game/leaderboard/incremental.ts — 강화 정산·보급 개봉·레이드 정산·대난투 발표)이
 * 유지하고, 이 크론은 **시간별 1회** 전체 재계산으로 드리프트를 교정하는 백스톱이다
 * (best-effort 증분이 놓친 갱신·밴/탈퇴 잔재 정리·마일스톤 벌크 캐치업 포함).
 * codex_champions(아이템 상위3)도 동승 — 실시간은 강화 정산의 per-item 부분 재계산이 담당.
 * :11 오프셋(:00 혼잡·:07 rank-leader 회피). 인증 = CRON_SECRET / x-vercel-cron.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { openServerIds } from '@/lib/game/server-list';
import { rebuildLeaderboardSnapshot, rebuildCodexChampions } from '@/lib/game/leaderboard/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 스냅샷 실패가 뒤 서버 랭킹 갱신을 막지 않도록. 멱등 rebuild라 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        const counts = await rebuildLeaderboardSnapshot(sid);
        await rebuildCodexChampions(sid);
        results.push({ serverId: sid, counts });
      } catch (se) {
        console.error('[leaderboard-snapshot] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    return Response.json({ ok, results, kind: 'leaderboard-snapshot' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[leaderboard-snapshot]', e);
    return Response.json({ ok: false, error: (e as Error).message, kind: 'leaderboard-snapshot' }, { status: 500 });
  }
}
