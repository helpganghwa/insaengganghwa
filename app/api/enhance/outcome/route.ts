import { NextResponse } from 'next/server';

import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 강화 수령 결과 복구 조회(2026-07-21 공포님 제보) — 수령 액션의 응답이 유실됐을 때
 * (배포 스큐·모바일 복귀 직후) 클라이언트가 판정 결과를 되찾아 연출을 재생하는 용도.
 * ⚠ 서버 액션이 아닌 **순수 JSON GET**이어야 함 — 액션은 배포 스큐에 같이 깨져서
 * 복구 경로 자체가 실패한다(이 라우트가 존재하는 이유).
 *
 * 응답: { state: 'pending' }   — 잡이 아직 running(액션이 실행 안 됨 — 재시도 안전)
 *       { state: 'done', outcome, fromLevel, toLevel, nextJob } — 판정 완료(로그에서 복구).
 *         nextJob = 자동 재등록된 다음 잡(있으면) — 클라가 게이지를 즉시 리셋하는 데 사용.
 *       { state: 'gone' }      — 취소됐거나 로그 매칭 실패(재동기화 권장)
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const raw = new URL(req.url).searchParams.get('job') ?? '';
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: 'bad_job' }, { status: 400 });

  const rows = (await db.execute(sql`
    select j.status::text as status, j.user_equipment_id::text as ueid, j.from_level, j.started_at
    from enhancement_jobs j
    where j.id = ${raw}::bigint and j.user_id = ${userId}::uuid
    limit 1
  `)) as unknown as { status: string; ueid: string; from_level: number; started_at: string }[];
  const job = rows[0];
  if (!job) return NextResponse.json({ state: 'gone' });
  if (job.status === 'running') return NextResponse.json({ state: 'pending' });
  if (job.status !== 'completed') return NextResponse.json({ state: 'gone' });

  // 로그엔 job_id가 없어 (장비, from_level, 잡 시작 이후) 최신 1건으로 매칭 — 같은 장비의
  // 다음 잡 판정과 섞이지 않도록 from_level까지 일치 조건.
  const logs = (await db.execute(sql`
    select result::text as outcome, from_level, to_level
    from enhancement_logs
    where user_id = ${userId}::uuid and user_equipment_id = ${job.ueid}::bigint
      and from_level = ${job.from_level} and created_at >= ${job.started_at}::timestamptz
    order by created_at desc limit 1
  `)) as unknown as { outcome: string; from_level: number; to_level: number }[];
  const log = logs[0];
  if (!log) return NextResponse.json({ state: 'gone' });

  // 자동 재등록된 다음 잡(있으면) — 같은 장비의 현재 running 잡. 클라가 이 정보로 게이지를
  // 즉시 리셋(응답 유실 후 옛 잡 100% 잔류·재수령 방지, 2026-07-23 Eclipse 제보 근본 수정).
  const nextRows = (await db.execute(sql`
    select j.id::text as job_id, j.from_level, j.target_level, j.base_rate_bp,
           j.started_at, j.complete_at
    from enhancement_jobs j
    where j.user_id = ${userId}::uuid and j.user_equipment_id = ${job.ueid}::bigint
      and j.status = 'running'
    order by j.started_at desc limit 1
  `)) as unknown as {
    job_id: string;
    from_level: number;
    target_level: number;
    base_rate_bp: number;
    started_at: string;
    complete_at: string;
  }[];
  const nx = nextRows[0];
  const nextJob = nx
    ? {
        jobId: nx.job_id,
        fromLevel: nx.from_level,
        targetLevel: nx.target_level,
        baseRateBp: nx.base_rate_bp,
        startedAtIso: new Date(nx.started_at).toISOString(),
        completeAtIso: new Date(nx.complete_at).toISOString(),
      }
    : null;

  return NextResponse.json({
    state: 'done',
    outcome: log.outcome,
    fromLevel: log.from_level,
    toLevel: log.to_level,
    nextJob,
  });
}
