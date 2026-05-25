import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 세계역사 적재 helper — SCHEMA §12 / SCREEN-ANALYSIS §4.
 *
 * 각 helper는 (1) 판타지 톤 message를 템플릿으로 생성, (2) world_history INSERT.
 * 게임 트랜잭션과 분리(best-effort) — 호출자가 .catch()로 swallow.
 *
 * 자동 적재 훅:
 *  - resolveEnhance: toLevel === 99/199/... → recordEnhanceMilestone
 *  - transcendPerform: transcendLevel === 10 → recordTranscendMax
 *  - codex check: 도감 100% 첫 완성 → recordCodexComplete
 *
 * 운영 공지: admin form이 직접 호출 (recordOperatorNotice).
 */

type EventType =
  | 'enhance_99'
  | 'transcend_max'
  | 'codex_complete'
  | 'operator_notice'
  | 'genesis';

async function insert(
  userId: string | null,
  eventType: EventType,
  payload: Record<string, unknown>,
  message: string,
): Promise<void> {
  await db.execute(sql`
    insert into world_history (user_id, event_type, payload, message)
    values (
      ${userId === null ? null : sql`${userId}::uuid`},
      ${eventType}::world_event_type,
      ${JSON.stringify(payload)}::jsonb,
      ${message}
    )
  `);
}

/** 시적 시각 표현 — KST 일 기준 "달의 N번째 밤". */
function nightPhrase(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const day = kst.getUTCDate();
  return `달의 ${day}번째 밤`;
}

export async function recordEnhanceMilestone(
  userId: string,
  nickname: string,
  itemKo: string,
  level: number,
): Promise<void> {
  // 사이클 무한 — 99/199/299 모두 의미있는 milestone. 표현 약간 차등.
  const message =
    level === 99
      ? `${nightPhrase()}, **${nickname}**의 손에서 _${itemKo}_가 **+99**의 경지에 닿았다.`
      : `${nightPhrase()}, **${nickname}**이(가) _${itemKo}_를 **+${level}** 너머로 이끌었다.`;
  await insert(userId, 'enhance_99', { itemKo, level, nickname }, message);
}

export async function recordTranscendMax(
  userId: string,
  nickname: string,
  itemKo: string,
): Promise<void> {
  const message = `${nightPhrase()}, **${nickname}**이(가) _${itemKo}_를 10번 초월시켜 신화의 영역으로 보냈다.`;
  await insert(userId, 'transcend_max', { itemKo, nickname }, message);
}

export async function recordCodexComplete(
  userId: string,
  nickname: string,
  total: number,
): Promise<void> {
  const message = `${nightPhrase()}, **${nickname}**이(가) ${total}개의 장비 모두를 도감에 새겼다 — 첫 완성자다.`;
  await insert(userId, 'codex_complete', { total, nickname }, message);
}

export async function recordOperatorNotice(message: string): Promise<void> {
  await insert(null, 'operator_notice', { source: 'admin' }, message);
}

export async function recordGenesis(message: string): Promise<void> {
  await insert(null, 'genesis', { source: 'seed' }, message);
}
