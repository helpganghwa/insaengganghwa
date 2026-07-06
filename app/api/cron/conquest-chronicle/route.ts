/**
 * 점령전 공개(reveal)+세계 연대기 생성 cron — **자정(KST 00시대)**에 매일 1회.
 * 대상 날짜 = 방금 끝난 전투일 = **어제(KST)**. kst_day 멱등(이미 있으면 skip).
 * 23:00에 저장만 된(미공개) 어제 전투를 자정에 공개: revealConquest가 소유권 적용·결과 우편을
 * 발송하고 published_at을 마킹 → 그 뒤 narrate. reveal을 narrate보다 먼저 호출해 연대기가
 * 공개된(=확정 소유권) 데이터를 읽도록 보장. reveal·narrate 모두 멱등(다중 tick 안전).
 * 스케줄: vercel.json UTC 15시대 5분 간격(= KST 00시대) — 배포 겹침 대비 윈도.
 * 인증: CRON_SECRET Bearer(설정 시) — isCronAuthorized.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { revealConquest, carryOverDefenders } from '@/lib/game/guild/conquest/run';
import { openServerIds } from '@/lib/game/server-list';
import { kstDateString } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 백스톱 포함 1틱당 처리 일수 상한 — 연대기 LLM 호출이 있어 maxDuration(60s) 예산 보호.
// 밀린 날이 더 있어도 다음 틱(5분 간격 12틱)이 이어받는다.
const MAX_DAYS_PER_TICK = 3;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  // 자정(KST 00시대) 실행 → 어제(전투일) 결과를 공개·발표하고 연대기 생성(24h 전 KST 날짜).
  const kstDay = kstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  try {
    const results = [];
    // per-server 에러격리(감사 G1) — 한 서버 공개 실패가 뒤 서버 소유권·보상 우편 누락으로 번지지 않도록. 멱등 재시도 안전.
    for (const sid of await openServerIds()) {
      try {
        // 대상 일자 = 어제 + **과거 미공개 잔여분**(백스톱, 감사 M-2) — 공개 윈도(00시대 12틱)가
        // 장애로 전량 실패하면 실행 시각 파생 날짜만 봐서는 그 전투가 영영 미공개로 남아
        // 소유권 이전·보상 우편이 영구 유실된다. published_at is null을 날짜 무관 스캔.
        const pendingRows = (await db.execute(sql`
          select distinct battle_kst_day::text d from conquest_battles
          where server_id = ${sid} and published_at is null and battle_kst_day <= ${kstDay}
          order by d limit ${MAX_DAYS_PER_TICK}
        `)) as unknown as { d: string }[];
        const days = pendingRows.map((r) => r.d);
        // 연대기는 공개 여부와 별개 멱등(kst_day 기준)이라 어제 날짜는 항상 시도.
        if (!days.includes(kstDay)) days.push(kstDay);

        for (const day of days) {
          // narrate 전에 전투 공개(소유권 적용·우편·published 마킹) — 멱등.
          const rev = await revealConquest(sid, day);
          // 공개 후 수비 배치 이월(안 뺏긴 구역만, 공격은 해제) — 재실행 안전. 실패해도 공개/연대기엔 무관.
          const carry = await carryOverDefenders(sid, day).catch(() => ({ carried: 0 }));
          results.push({
            serverId: sid,
            kstDay: day,
            revealed: rev.revealed,
            mailed: rev.mailed,
            carried: carry.carried,
            ...(await generateAndStoreChronicle(day, sid)),
          });
        }
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
