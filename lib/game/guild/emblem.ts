import 'server-only';

import sharp from 'sharp';
import { and, eq, desc, sql } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildEmblems } from '@/lib/db/schema/guild';
import { profiles } from '@/lib/db/schema/profiles';

import { GUILD_EMBLEM_REROLL_COST_DIAMOND, MAX_GUILD_EMBLEMS } from './balance';
import { GuildError } from './errors';
import { buildEmblemPrompt, toneColor, type EmblemSelection } from './emblem-vocab';

/**
 * 길드 문양 런타임 생성 — GUILD §1.6. pixflux(동기, base64) → Supabase Storage 업로드 →
 * guilds.emblem_url/emblem_color 갱신. 결성·재생성에서 호출(best-effort — 실패해도 폴백 문양).
 *
 * 외부 의존: PIXELLAB_API_KEY, Supabase Storage public 버킷 `guild-emblems`(코드가 멱등 생성).
 */
const PIXFLUX_URL = 'https://api.pixellab.ai/v1/generate-image-pixflux';
const BUCKET = 'guild-emblems';

let _client: SupabaseClient | null = null;
function serviceClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE service env missing');
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

// 경량 품질 가드(§1.6) — AI 검수 불필요(고정 어휘). 빈/깨진(거의 투명) · 투명배경 실패(거의 꽉 참)만 거름.
const MIN_OPAQUE_RATIO = 0.03; // 미만 = 빈/깨진 이미지
const MAX_OPAQUE_RATIO = 0.98; // 초과 = no_background 실패(사각 덩어리)
const OPAQUE_ALPHA = 24; // 이 alpha 초과면 불투명 픽셀로 카운트

/** 불투명 픽셀 비율이 정상 범위인지(빈/꽉참 결함 검출). 디코드 실패도 결함으로 간주. */
async function emblemQualityOk(png: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const total = info.width * info.height;
    if (total === 0) return false;
    let opaque = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i]! > OPAQUE_ALPHA) opaque++;
    const ratio = opaque / total;
    return ratio >= MIN_OPAQUE_RATIO && ratio <= MAX_OPAQUE_RATIO;
  } catch {
    return false;
  }
}

/**
 * 프레임 채우기 — 투명 여백 trim → (size-2*pad) 박스에 비율 유지로 꽉 차게(contain) → pad 둘러 중앙 정렬.
 * 깃발(세로 길쭉)·날개(중앙 작음) 등이 작게 떠 보이던 문제 해결 — 맵 노드(16~24px) 가시성↑.
 * trim 실패(거의 균일 등) 시 원본 그대로.
 */
async function fitEmblemToFrame(png: Buffer, size = 128, pad = 6): Promise<Buffer> {
  let trimmed: Buffer;
  try {
    trimmed = await sharp(png).trim({ threshold: 10 }).toBuffer();
  } catch {
    return png;
  }
  const inner = size - pad * 2;
  return sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** pixflux 128² no_background 생성 → PNG Buffer. 429는 백오프 재시도, 그 외 실패는 throw. */
async function generateEmblemPng(prompt: string): Promise<Buffer> {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error('PIXELLAB_API_KEY missing');
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(PIXFLUX_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        description: prompt,
        image_size: { width: 128, height: 128 },
        no_background: true,
      }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      lastErr = '429 rate limit';
      continue;
    }
    if (!res.ok) throw new Error(`pixflux HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { image?: { base64?: string } };
    const b64 = j.image?.base64;
    if (!b64) throw new Error('pixflux no base64');
    const buf = Buffer.from(b64, 'base64');
    if (!isPng(buf)) throw new Error('pixflux returned non-PNG');
    // 경량 품질 가드 — 빈/깨진·꽉찬 결함이면 재생성(무료 1회·재생성 모두 결함 저장 회피).
    if (!(await emblemQualityOk(buf))) {
      lastErr = 'low quality (empty/full)';
      console.warn(`[guild.emblem] 품질 미달 재생성 (attempt ${attempt})`);
      continue;
    }
    return buf;
  }
  throw new Error(`pixflux retries exhausted: ${lastErr}`);
}

/** 버킷 보장(멱등) → 지정 경로 업로드(upsert) → public URL(+캐시버스트). */
async function uploadEmblem(path: string, png: Buffer): Promise<string> {
  const supabase = serviceClient();
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, png, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** 활성 문양 지정 + guilds.emblem_url/color 비정규화 미러 동기화(읽기 코드 호환). */
async function setGuildActiveEmblem(
  guildId: bigint,
  emblem: { id: bigint; emblemUrl: string | null; emblemColor: string | null },
): Promise<void> {
  await db
    .update(guilds)
    .set({ activeEmblemId: emblem.id, emblemUrl: emblem.emblemUrl, emblemColor: emblem.emblemColor })
    .where(eq(guilds.id, guildId));
}

/**
 * 길드에 새 문양 1개 생성·보관 + 활성 지정. 행 먼저 insert(경로용 id 확보) → 생성/업로드 →
 * url 갱신 → 활성화. 생성/업로드 실패 시 빈 행 정리 후 rethrow. (비용/권한은 호출부 책임)
 */
async function createEmblemForGuild(
  guildId: bigint,
  selection: EmblemSelection,
): Promise<{ emblemId: bigint; emblemUrl: string }> {
  const color = toneColor(selection.toneId);
  const [row] = await db
    .insert(guildEmblems)
    .values({ guildId, emblemUrl: null, emblemColor: color })
    .returning({ id: guildEmblems.id });
  const emblemId = row!.id;
  try {
    const raw = await generateEmblemPng(buildEmblemPrompt(selection));
    const png = await fitEmblemToFrame(raw); // 투명 여백 제거·프레임 채움(가시성↑)
    const emblemUrl = await uploadEmblem(`${guildId}/${emblemId}.png`, png);
    await db.update(guildEmblems).set({ emblemUrl }).where(eq(guildEmblems.id, emblemId));
    await setGuildActiveEmblem(guildId, { id: emblemId, emblemUrl, emblemColor: color });
    return { emblemId, emblemUrl };
  } catch (e) {
    await db.delete(guildEmblems).where(eq(guildEmblems.id, emblemId)).catch(() => {});
    throw e;
  }
}

/**
 * 결성 시 첫 문양 — best-effort(실패해도 길드 유지). guild_emblems 1행 생성 + 활성 지정.
 */
export async function generateAndStoreEmblem(input: {
  guildId: bigint;
  selection: EmblemSelection;
}): Promise<{ emblemUrl: string }> {
  const { emblemUrl } = await createEmblemForGuild(input.guildId, input.selection);
  return { emblemUrl };
}

/** 길드 보관 문양 목록(활성 표시 포함) — 설정 화면용. 최신순. */
export async function getGuildEmblems(
  guildId: bigint,
): Promise<{ id: string; emblemUrl: string | null; emblemColor: string | null; isActive: boolean }[]> {
  const [g] = await db
    .select({ activeId: guilds.activeEmblemId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  const rows = await db
    .select({ id: guildEmblems.id, emblemUrl: guildEmblems.emblemUrl, emblemColor: guildEmblems.emblemColor })
    .from(guildEmblems)
    .where(eq(guildEmblems.guildId, guildId))
    .orderBy(desc(guildEmblems.id));
  return rows.map((r) => ({
    id: r.id.toString(),
    emblemUrl: r.emblemUrl,
    emblemColor: r.emblemColor,
    isActive: g?.activeId != null && g.activeId === r.id,
  }));
}

/** 길드장 + 길드 id 확인(공통 가드). */
async function requireLeaderGuild(userId: string): Promise<bigint> {
  const [m] = await db
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (m.role !== 'leader') throw new GuildError('NOT_LEADER');
  return m.guildId;
}

/**
 * 새 문양 생성·보관 — 길드장만, 5,000💎(💎 sink·외형 BM). 보관 3개 미만일 때만. 생성 실패 시 환불.
 * 차감 트랜잭션(잔액+슬롯수 검증) → 외부 생성 → 실패 시 환불.
 */
export async function generateEmblem(input: {
  userId: string;
  selection: EmblemSelection;
}): Promise<{ emblemId: bigint; emblemUrl: string }> {
  const guildId = await db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.userId))
      .limit(1);
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader') throw new GuildError('NOT_LEADER');

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guildEmblems)
      .where(eq(guildEmblems.guildId, m.guildId));
    if (n >= MAX_GUILD_EMBLEMS) throw new GuildError('EMBLEM_MAX');

    const [prof] = await tx
      .select({ diamond: profiles.diamond })
      .from(profiles)
      .where(eq(profiles.id, input.userId))
      .for('update');
    if (!prof || prof.diamond < BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)) {
      throw new GuildError('INSUFFICIENT_DIAMOND');
    }
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} - ${BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)}` })
      .where(eq(profiles.id, input.userId));
    return m.guildId;
  });

  try {
    return await createEmblemForGuild(guildId, input.selection);
  } catch (e) {
    await db
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)}` })
      .where(eq(profiles.id, input.userId));
    throw e instanceof GuildError ? e : new GuildError('EMBLEM_GEN_FAILED');
  }
}

/** 보관 문양 중 하나를 활성으로 선택 — 길드장만, 무료. */
export async function setActiveEmblem(input: { userId: string; emblemId: bigint }): Promise<void> {
  const guildId = await requireLeaderGuild(input.userId);
  const [em] = await db
    .select({ id: guildEmblems.id, emblemUrl: guildEmblems.emblemUrl, emblemColor: guildEmblems.emblemColor })
    .from(guildEmblems)
    .where(and(eq(guildEmblems.id, input.emblemId), eq(guildEmblems.guildId, guildId)))
    .limit(1);
  if (!em) throw new GuildError('EMBLEM_NOT_FOUND');
  await setGuildActiveEmblem(guildId, em);
}

/** 보관 문양 삭제 — 길드장만, 무료. 최소 1개 유지. 활성 삭제 시 다른 문양으로 활성 이전. */
export async function deleteEmblem(input: { userId: string; emblemId: bigint }): Promise<void> {
  const guildId = await requireLeaderGuild(input.userId);
  const rows = await db
    .select({ id: guildEmblems.id, emblemUrl: guildEmblems.emblemUrl, emblemColor: guildEmblems.emblemColor })
    .from(guildEmblems)
    .where(eq(guildEmblems.guildId, guildId))
    .orderBy(desc(guildEmblems.id));
  if (rows.length <= 1) throw new GuildError('EMBLEM_MIN');
  const target = rows.find((r) => r.id === input.emblemId);
  if (!target) throw new GuildError('EMBLEM_NOT_FOUND');

  const [g] = await db
    .select({ activeId: guilds.activeEmblemId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  // 활성 문양을 지우면 남은 것 중 최신을 활성으로.
  if (g?.activeId === input.emblemId) {
    const next = rows.find((r) => r.id !== input.emblemId)!;
    await setGuildActiveEmblem(guildId, next);
  }
  await db.delete(guildEmblems).where(eq(guildEmblems.id, input.emblemId));
  // 스토리지 파일 정리(best-effort).
  await serviceClient().storage.from(BUCKET).remove([`${guildId}/${input.emblemId}.png`]).catch(() => {});
}
