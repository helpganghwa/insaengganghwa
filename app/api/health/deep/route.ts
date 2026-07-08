/**
 * 심층 헬스 체크 — **외부 uptime 모니터**용. DB 도달성 + cron 하트비트 정지(사망)를 함께 검사.
 *
 * 총체적 cron 정지의 유일한 사각을 마감한다: warm(내부 워치독)이 dead-man을 돌리지만 **warm 자체가
 * 죽으면**(CRON_SECRET 사고·배포 파손 등) 아무도 안 알린다. 이 엔드포인트는 cron이 아니라 **앱이
 * 서빙**하므로 warm이 죽어 warm의 하트비트가 stale이 되면 여기서 감지된다. 외부 모니터가 이 URL을
 * 주기 핑 → 503 또는 도달불가 시 알림하면 warm 사망까지 커버된다.
 *
 * /api/health(dpl만, 클라가 1분 폴링)와 분리 — 여긴 외부 모니터만 저빈도 호출(DB 질의 포함).
 * 공개(시크릿 불필요) — 노출 정보는 비민감(정지 cron 이름·DB 지연)만.
 *
 * 200 {ok:true}          : DB 정상 + 사망 cron 없음
 * 503 {ok:false, ...}    : DB 다운 또는 (한 번 돈 뒤) 정지한 cron 존재
 * 한 번도 안 돈 cron(lastSuccessAt=null)은 **출시 초 오탐 방지**로 제외 — 어드민 대시보드에선 보인다.
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
  if (dead.length > 0) {
    return Response.json(
      { ok: false, db: 'up', dbMs, deadCrons: dead },
      { status: 503, headers: NO_STORE },
    );
  }

  return Response.json({ ok: true, db: 'up', dbMs }, { status: 200, headers: NO_STORE });
}
