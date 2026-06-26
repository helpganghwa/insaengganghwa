/**
 * 점령전 공개(reveal)+세계 연대기 생성 cron — **자정(KST 00시대)**에 매일 1회.
 * 대상 날짜 = 방금 끝난 전투일 = **어제(KST)**. kst_day 멱등(이미 있으면 skip).
 * 23:00에 저장만 된(미공개) 어제 전투를 자정에 공개: revealConquest가 소유권 적용·결과 우편을
 * 발송하고 published_at을 마킹 → 그 뒤 narrate. reveal을 narrate보다 먼저 호출해 연대기가
 * 공개된(=확정 소유권) 데이터를 읽도록 보장. reveal·narrate 모두 멱등(다중 tick 안전).
 * 스케줄: vercel.json UTC 15시대 5분 간격(= KST 00시대) — 배포 겹침 대비 윈도.
 * 인증: CRON_SECRET Bearer(설정 시) — isCronAuthorized.
 */
import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { revealConquest, carryOverDefenders } from '@/lib/game/guild/conquest/run';
import { openServerIds } from '@/lib/game/server-list';
import { kstDateString } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // 자정(KST 00시대) 실행 → 어제(전투일) 결과를 공개·발표하고 연대기 생성(24h 전 KST 날짜).
  const kstDay = kstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 공개 실패가 뒤 서버 소유권·보상 우편 누락으로 번지지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        // narrate 전에 어제 전투 공개(소유권 적용·우편·published 마킹) — 멱등.
        const rev = await revealConquest(sid, kstDay);
        // 공개 후 수비 배치 이월(안 뺏긴 구역만, 공격은 해제) — 재실행 안전. 실패해도 공개/연대기엔 무관.
        const carry = await carryOverDefenders(sid, kstDay).catch(() => ({ carried: 0 }));
        results.push({
          serverId: sid,
          revealed: rev.revealed,
          mailed: rev.mailed,
          carried: carry.carried,
          ...(await generateAndStoreChronicle(kstDay, sid)),
        });
      } catch (se) {
        console.error('[conquest-chronicle] server', sid, se);
        results.push({ serverId: sid, error: (se as Error).message });
      }
    }
    const ok = results.every((r) => !('error' in r));
    return Response.json({ ok, kstDay, results, kind: 'conquest-chronicle' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[conquest-chronicle]', e);
    return Response.json(
      { ok: false, kstDay, error: (e as Error).message, kind: 'conquest-chronicle' },
      { status: 500 },
    );
  }
}
