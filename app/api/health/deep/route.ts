/**
 * 심층 헬스 체크 — **외부 uptime 모니터**용. DB 도달성 + cron 하트비트 정지(사망)를 함께 검사.
 *
 * 총체적 cron 정지의 사각을 마감한다: warm(내부 워치독)이 dead-man을 돌리지만 **warm 자체가
 * 죽으면**(CRON_SECRET 사고·배포 파손 등) 아무도 안 알린다. 이 엔드포인트는 cron이 아니라 **앱이
 * 서빙**하므로 warm이 죽어 warm 하트비트가 stale이 되면 여기서 503으로 감지된다(외부 모니터 알림).
 *
 * ⚠ 503(다운)은 **앱/DB 불능 또는 warm 본체 정지(총체적 cron 정지)만**. 개별 크론(창 기반
 * push-daily-supply 등)의 일시 정지는 다운이 아니라 정보다 — 200 body의 staleCrons로만 노출하고
 * 내부 warm 푸시·어드민이 알림 담당(외부 모니터 오알림 방지, 2026-07-08 push-daily-supply 사건).
 *
 * /api/health(dpl만, 클라가 1분 폴링)와 분리 — 여긴 외부 모니터만 저빈도 호출(DB 질의 포함).
 * 공개(시크릿 불필요) — 노출 정보는 비민감(정지 cron 이름·DB 지연)만.
 *
 * 200 {ok:true, staleCrons?}  : 앱/DB 정상(개별 정지 크론은 staleCrons에 정보로)
 * 503 {ok:false, reason}      : DB 다운 또는 warm 정지(cron-system-down)
 * 한 번도 안 돈 cron(lastSuccessAt=null)은 출시 초 오탐 방지로 제외.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { getStaleCrons } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, no-cache, must-revalidate' };

export async function GET() {
  const t0 = Date.now();

  // 1) DB 도달성 — 가장 싼 쿼리.
  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    return Response.json(
      { ok: false, db: 'down', error: (e as Error).message.slice(0, 120) },
      { status: 503, headers: NO_STORE },
    );
  }
  const dbMs = Date.now() - t0;

  // 2) cron 사망 — 한 번 돈 뒤 정지한 것만(never-run은 출시 초 오탐이라 제외).
  let dead: string[] = [];
  try {
    const stale = await getStaleCrons(Date.now());
    dead = stale.filter((s) => s.lastSuccessAt != null).map((s) => s.name);
  } catch {
    // 하트비트 조회 실패 — DB는 살아있으니(위 통과) cron 판정만 스킵(오탐 방지).
  }
  // ⚠ '다운'(503)은 **앱/DB 불능 또는 warm 워치독 본체 정지(=총체적 cron 정지)**만 — 외부 모니터가
  // "사이트 다운"으로 알려야 하는 진짜 사건. warm은 매분 도는 최신뢰 카나리라 정지=cron 시스템 붕괴.
  // 개별 크론(특히 창 기반 push-daily-supply 등)의 일시 정지는 다운이 아니다 → 내부 warm 푸시·어드민이
  // 알림 담당하고, 여기선 200 body의 staleCrons로만 노출(외부 모니터 오알림 방지, 2026-07-08 사건).
  if (dead.includes('warm')) {
    return Response.json(
      { ok: false, db: 'up', dbMs, reason: 'cron-system-down', deadCrons: dead },
      { status: 503, headers: NO_STORE },
    );
  }

  return Response.json(
    { ok: true, db: 'up', dbMs, ...(dead.length > 0 ? { staleCrons: dead } : {}) },
    { status: 200, headers: NO_STORE },
  );
}
