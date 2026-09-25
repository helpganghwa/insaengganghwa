'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { guilds, worldChronicle, zones } from '@/lib/db/schema/guild';
import { generateAndStoreChronicle } from '@/lib/game/guild';
import { chronicleIssues, improveChronicleText, type ChronicleImproveResult } from '@/lib/game/guild/conquest/chronicle';
import { CHRONICLE_FEEDBACK, CHRONICLE_IMPROVE_MODELS, type ChronicleFeedbackKey, type ChronicleImproveModel } from '@/lib/game/guild/conquest/chronicle-options';

type Result = { status: 'success' } | { status: 'error'; message: string };

/**
 * 어드민이 손으로 넣거나 고친 2필드 마커에 불변 id 부착(0141) — 생성 경로(enrichMarkers)와 동일
 * 규칙. 없으면 이름 기반 레거시로 저장돼, 막아둔 동명 재사용 오귀속이 수정 경로로 되살아난다.
 * 길드는 현존 매핑 실패 시 0(해산 센티널), 구역은 매핑 실패 시 그대로(표시 전용).
 */
async function attachMarkerIds(serverId: number, s: string): Promise<string> {
  const [guildRows, zoneRows] = await Promise.all([
    db.select({ id: guilds.id, name: guilds.name }).from(guilds).where(eq(guilds.serverId, serverId)),
    db.select({ id: zones.id, name: zones.name }).from(zones).where(eq(zones.serverId, serverId)),
  ]);
  const gid = new Map(guildRows.map((g) => [g.name, Number(g.id)]));
  const zid = new Map(zoneRows.map((z) => [z.name, z.id]));
  return s
    .replace(/\{g\|([^}|]+)\}/g, (_m, n: string) => `{g|${n.trim()}|${gid.get(n.trim()) ?? 0}}`)
    .replace(/\{z\|([^}|]+)\}/g, (m, n: string) => {
      const id = zid.get(n.trim());
      return id != null ? `{z|${n.trim()}|${id}}` : m;
    });
}

/**
 * 연대기 수정 — 자정 공개 전 검수 창(23:05~24:00)에서 헤드라인/본문 교정.
 * 공개 후 수정도 허용(월드 화면은 매 조회 DB 읽기 — 즉시 반영).
 */
export async function updateChronicleAction(input: {
  serverId: number;
  kstDay: string; // 'YYYY-MM-DD'
  headline: string;
  todayText: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const headline = await attachMarkerIds(input.serverId, input.headline.trim().slice(0, 200));
    const todayText = await attachMarkerIds(input.serverId, input.todayText.trim().slice(0, 4000));
    // 헤드라인은 빈 값이 정상(큰 사건 없는 날 = '') — 빈 헤드라인 날에 본문 수정 저장이
    // 항상 거부되던 버그(07-17 검수 수정 미반영 사건). 본문만 필수.
    if (!todayText) return { status: 'error', message: '본문을 입력하세요.' };
    const rows = await db
      .update(worldChronicle)
      .set({ headline, todayText })
      .where(
        and(
          eq(worldChronicle.serverId, input.serverId),
          eq(worldChronicle.kstDay, input.kstDay),
        ),
      )
      .returning({ kstDay: worldChronicle.kstDay });
    if (rows.length === 0) return { status: 'error', message: '해당 일자 연대기가 없습니다.' };
    revalidatePath('/admin/preview');
    revalidatePath('/guild/map');
    return { status: 'success' };
  } catch (e) {
    console.error('[admin.preview] chronicle update', (e as Error).message);
    return { status: 'error', message: '저장 중 오류가 발생했습니다.' };
  }
}

/**
 * 연대기 재생성(2026-07-30) — 생성 결과가 이상하면 검수 창에서 주사위를 다시 굴린다.
 * 지우지 않고 새 결과로 **덮어쓴다**(replace) — 생성이 실패하거나 함수가 시간 초과로 끊겨도 기존 행이 그대로 남는다.
 * LLM 1~3회(생성 루프 최대 225초)라 수십 초~몇 분 걸린다 — 버튼 쪽에서 진행 표시 필수.
 */
export async function regenerateChronicleAction(input: {
  serverId: number;
  kstDay: string; // 'YYYY-MM-DD'
}): Promise<Result> {
  try {
    await requireAdmin();
    const [cur] = await db
      .select({ kstDay: worldChronicle.kstDay })
      .from(worldChronicle)
      .where(
        and(eq(worldChronicle.serverId, input.serverId), eq(worldChronicle.kstDay, input.kstDay)),
      )
      .limit(1);
    if (!cur) return { status: 'error', message: '해당 일자 연대기가 없습니다.' };
    try {
      const r = await generateAndStoreChronicle(input.kstDay, input.serverId, { replace: true });
      if (r.reason === 'in-progress') return { status: 'error', message: '다른 생성이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.' };
      if (!r.created) throw new Error(r.reason ?? 'not-created');
    } catch (e) {
      console.error('[admin.preview] chronicle regen', (e as Error).message);
      return { status: 'error', message: '재생성에 실패해 기존 내용을 유지했습니다.' };
    }
    revalidatePath('/admin/preview');
    revalidatePath('/guild/map');
    return { status: 'success' };
  } catch (e) {
    console.error('[admin.preview] chronicle regen', (e as Error).message);
    return { status: 'error', message: '재생성 중 오류가 발생했습니다.' };
  }
}

/**
 * 검수 개선(2026-09-15) — 운영자가 고른 피드백·모델로 현재 텍스트(수정분 포함)를 고친 결과를 돌려준다.
 * 저장하지 않는다 — 화면이 입력칸을 바로 교체하고, 확정은 기존 '수정 저장'. LLM 1회(20~60초).
 */
export async function improveChronicleAction(input: {
  serverId: number;
  kstDay: string;
  headline: string;
  todayText: string;
  feedback: string[];
  note?: string;
  model: string;
}): Promise<ChronicleImproveResult> {
  try {
    await requireAdmin();
    const feedback = input.feedback.filter((k): k is ChronicleFeedbackKey => k in CHRONICLE_FEEDBACK);
    if (!(input.model in CHRONICLE_IMPROVE_MODELS)) return { ok: false, reason: '지원하지 않는 모델입니다.', issuesBefore: [] };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.kstDay)) return { ok: false, reason: '날짜 형식 오류', issuesBefore: [] };
    return await improveChronicleText({
      kstDay: input.kstDay,
      serverId: input.serverId,
      today: input.todayText,
      headline: input.headline,
      feedback,
      note: input.note,
      model: input.model as ChronicleImproveModel,
    });
  } catch (e) {
    console.error('[admin.preview] chronicle improve', (e as Error).message);
    return { ok: false, reason: `개선 중 오류: ${(e as Error).message.slice(0, 120)}`, issuesBefore: [] };
  }
}

/** 코드 검증만(LLM 없음) — 마커 누락·연출 순서·사실 대조 목록. */
export async function checkChronicleAction(input: { serverId: number; kstDay: string; todayText: string }): Promise<{ issues: string[] } | { error: string }> {
  try {
    await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.kstDay)) return { error: '날짜 형식 오류' };
    return { issues: await chronicleIssues(input.kstDay, input.serverId, input.todayText) };
  } catch (e) {
    console.error('[admin.preview] chronicle check', (e as Error).message);
    return { error: `검증 중 오류: ${(e as Error).message.slice(0, 120)}` };
  }
}
