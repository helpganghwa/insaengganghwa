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
import { revalidateTag } from 'next/cache';

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
        // 연대기 구멍 백필(감사 2026-07-07 D-묶음) — 공개(published)는 됐는데 연대기 생성이
        // 실패(LLM 오류 등)한 날은 위 스캔(published_at is null 기준)에 다시 안 잡혀 영구
        // 유실됐다. 최근 7일 중 전투는 있고 world_chronicle 행이 없는 날을 재시도 대상으로
        // 추가(generate는 멱등 — 행 있으면 skip, 사건 없으면 no-event로 조용히 끝).
        const holes = (await db.execute(sql`
          select distinct cb.battle_kst_day::text d
          from conquest_battles cb
          where cb.server_id = ${sid}
            and cb.battle_kst_day < ${kstDay}
            and cb.battle_kst_day >= ${kstDay}::date - interval '7 days'
            and not exists (
              select 1 from world_chronicle wc
              where wc.server_id = ${sid} and wc.kst_day = cb.battle_kst_day
            )
          order by d
        `)) as unknown as { d: string }[];
        for (const h of holes) if (!days.includes(h.d)) days.push(h.d);
        // 1틱 예산 보호 — 백스톱·백필 합산 상한(LLM 호출 포함). 잔여는 다음 틱(5분 간격)이
        // 이어받는다. 단 어제(오늘 자정 공개분)는 항상 포함 — 잘리면 마지막 슬롯과 교체.
        days.splice(MAX_DAYS_PER_TICK);
        if (!days.includes(kstDay) && days.length > 0) days[days.length - 1] = kstDay;

        for (const day of days) {
          // narrate 전에 전투 공개(소유권 적용·우편·published 마킹) — 멱등.
          // 연대기는 통상 23시대 conquest-run이 **사전 생성**해 두므로(정각 공개 설계) 아래
          // generate는 skip('already')로 끝난다 — 이 틱의 실작업은 플립·우편뿐(LLM 없음, 수초).
          // 사전 생성이 실패한 날만 여기서 백필(LLM 생성)된다.
          const rev = await revealConquest(sid, day);
          // 공개(소유권 플립) 직후 세계 피드 캐시 즉시 무효화 — 30s TTL 대기 없이 지도/피드 반영.
          if (rev.revealed > 0) revalidateTag('world-feed', 'max');
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
