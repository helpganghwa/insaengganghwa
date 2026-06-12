import 'server-only';

import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, desc, sql } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { getWalletDiamond, walletTrySpend } from '@/lib/game/wallet';
import { guilds, guildMembers, guildEmblems } from '@/lib/db/schema/guild';

import { GUILD_EMBLEM_REROLL_COST_DIAMOND, MAX_GUILD_EMBLEMS } from './balance';
import { GuildError } from './errors';
import {
  buildEmblemPrompt,
  mainColor,
  EMBLEM_SHAPES,
  EMBLEM_TONES,
  EMBLEM_KEYWORDS,
  type EmblemSelection,
} from './emblem-vocab';

// ── AI 프롬프트 생성(Haiku) — 선택값을 코히어런트한 픽셀 엠블럼 영문 프롬프트로 변환. 실패 시 템플릿 폴백. ──
const EMBLEM_PROMPT_MODEL = 'claude-haiku-4-5-20251001';
let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return (_anthropic ??= new Anthropic({ apiKey: key }));
}
const EMBLEM_PROMPT_SYSTEM = `You write a single-line English image prompt for a pixel-art guild emblem generator (Pixellab pixflux).
The emblem must look like a classic OLD MEDIEVAL HERALDIC COAT OF ARMS / family crest — ornate, symmetrical, vintage, ceremonial. Not a modern logo, not a flat icon.
Given a shape, two colors, a main keyword and an optional sub keyword, compose ONE coherent heraldic crest.
Rules:
- Output ONLY the prompt text (English, one line, <120 words). No quotes, no preamble, no explanation.
- Style anchors (always include the spirit): medieval heraldry, coat of arms, family crest, ornate, symmetrical, vintage emblem, dark fantasy, pixel art.
- The MAIN keyword is the central heraldic charge: large, bold, the clear focal point.
- The SUB keyword (if any) MUST be clearly visible too — place it as a secondary heraldic element such as supporters flanking the main on BOTH sides, or crossed behind it, or a charge on a chief/base band. Smaller than the main but distinctly rendered, NEVER omitted or dissolved into texture.
- Use the given shape as the overall shield/crest silhouette. Main color as the field, sub color as the accents, border and trim.
- Palette: the two given colors clearly dominate (field = main color, accents/border/trim = sub color); a few small additional accent colors are okay, just keep it cohesive — not a busy rainbow.
- Detail: highly detailed, intricate ornate filigree and fine engraved linework, crisp clean pixel detail, rich shading and metallic depth, embossed relief.
- Compose everything into ONE unified crest — do NOT scatter unrelated floating objects.
- Always include: bold clean readable silhouette, fills the frame, centered, transparent background, no text, no lettering.`;

async function buildEmblemPromptAI(s: EmblemSelection): Promise<string> {
  try {
    const shape = EMBLEM_SHAPES.find((x) => x.id === s.shapeId)?.en ?? 'a round shield';
    const main = EMBLEM_TONES.find((x) => x.id === s.mainToneId)?.en ?? 'crimson';
    const sub = EMBLEM_TONES.find((x) => x.id === s.subToneId)?.en ?? 'gold';
    const mainKw = EMBLEM_KEYWORDS.find((x) => x.id === s.mainKeywordId)?.en ?? 'a dragon';
    const subKw = s.subKeywordId ? EMBLEM_KEYWORDS.find((x) => x.id === s.subKeywordId)?.en : null;
    const res = await anthropic().messages.create({
      model: EMBLEM_PROMPT_MODEL,
      max_tokens: 220,
      system: [{ type: 'text', text: EMBLEM_PROMPT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content:
            `Shape (overall crest silhouette): ${shape}\nMain color (field): ${main}\nSub color (accents/trim): ${sub}\n` +
            `Main keyword (central charge, focal point): ${mainKw}\n` +
            `Sub keyword (secondary charge, must be clearly visible — e.g. flanking supporters): ${subKw ?? 'none'}\n\n` +
            `Write the one-line heraldic coat-of-arms pixel guild crest prompt.`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === 'text');
    const text = block && 'text' in block ? block.text.trim().replace(/^["']|["']$/g, '') : '';
    if (text.length < 20) return buildEmblemPrompt(s); // 너무 짧음 → 폴백
    return text.slice(0, 1000);
  } catch (e) {
    console.warn('[guild.emblem] AI 프롬프트 실패 — 템플릿 폴백', e);
    return buildEmblemPrompt(s);
  }
}

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
        // 디테일↑(더 큰 캔버스 → 다운스케일), 프롬프트 충실도↑(색 팔레트·디테일 반영), 잡색·노이즈 회피.
        image_size: { width: 160, height: 160 },
        no_background: true,
        text_guidance_scale: 9,
        negative_description:
          'blurry, low detail, flat, plain, messy, cluttered, busy rainbow, text, letters, watermark, signature',
      }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 700 * 2 ** attempt)); // 백오프 단축(긴 요청 단축)
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
 * 문양 이미지 생성 + 스토리지 업로드(DB 미접근). **DB 행/차감 전에** 수행해야 함 —
 * 생성이 실패/타임아웃해도 빈 행이나 잘못된 차감이 남지 않게(2026-06-11 버그 수정).
 * 경로는 uuid 키(빈 행 선삽입으로 id를 미리 확보할 필요 없음).
 */
async function generateEmblemAsset(
  guildId: bigint,
  selection: EmblemSelection,
): Promise<{ emblemUrl: string; color: string | null }> {
  const color = mainColor(selection.mainToneId);
  const raw = await generateEmblemPng(await buildEmblemPromptAI(selection));
  const png = await fitEmblemToFrame(raw); // 투명 여백 제거·프레임 채움(가시성↑)
  const emblemUrl = await uploadEmblem(`${guildId}/${crypto.randomUUID()}.png`, png);
  return { emblemUrl, color };
}

/** url에서 스토리지 키 추출(삭제 정리용). 못 찾으면 null. */
function storageKeyFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return url.slice(i + marker.length).split('?')[0] || null;
}

/**
 * 결성 시 첫 문양(무료) — best-effort. 생성·업로드 성공 후에만 행 삽입 + 활성 지정(빈 행 방지).
 */
export async function generateAndStoreEmblem(input: {
  guildId: bigint;
  selection: EmblemSelection;
}): Promise<{ emblemUrl: string }> {
  const { emblemUrl, color } = await generateEmblemAsset(input.guildId, input.selection);
  const [row] = await db
    .insert(guildEmblems)
    .values({ guildId: input.guildId, emblemUrl, emblemColor: color })
    .returning({ id: guildEmblems.id });
  await setGuildActiveEmblem(input.guildId, { id: row!.id, emblemUrl, emblemColor: color });
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
 * 새 문양 생성·보관 — 길드장만, 5,000💎(💎 sink·외형 BM). 보관 최대 미만일 때만.
 * **생성·업로드 성공 후에만** 차감+행 삽입+활성화를 한 트랜잭션으로(2026-06-11 버그 수정):
 *  생성/타임아웃 실패 시 차감·빈 행이 전혀 남지 않음(환불 로직 불필요).
 */
export async function generateEmblem(input: {
  userId: string;
  serverId: number;
  selection: EmblemSelection;
}): Promise<{ emblemId: bigint; emblemUrl: string }> {
  const cost = BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND);
  // 1) 사전 검증(차감 없음) — 길드장·보유 한도·잔액. 비싼 생성 전에 빠르게 실패.
  const guildId = await requireLeaderGuild(input.userId);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guildEmblems)
    .where(eq(guildEmblems.guildId, guildId));
  if (n >= MAX_GUILD_EMBLEMS) throw new GuildError('EMBLEM_MAX');
  const pre = await getWalletDiamond(db, input.userId, input.serverId);
  if (pre < cost) throw new GuildError('INSUFFICIENT_DIAMOND');

  // 2) 생성·업로드(느림·과금 전). 실패하면 여기서 throw — DB 변경 전이라 차감/빈 행 없음.
  const { emblemUrl, color } = await generateEmblemAsset(guildId, input.selection);

  // 3) 성공 시에만 원자적으로 차감 + 행 삽입 + 활성화(시점 재검증).
  return db.transaction(async (tx) => {
    const [{ n: n2 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guildEmblems)
      .where(eq(guildEmblems.guildId, guildId));
    if (n2 >= MAX_GUILD_EMBLEMS) throw new GuildError('EMBLEM_MAX');
    const paid = await walletTrySpend(tx, input.userId, input.serverId, cost);
    if (!paid) throw new GuildError('INSUFFICIENT_DIAMOND');
    const [row] = await tx
      .insert(guildEmblems)
      .values({ guildId, emblemUrl, emblemColor: color })
      .returning({ id: guildEmblems.id });
    // 사용 중 문양 유지 — 생성은 보관함에만 추가(활성은 그대로). 단 활성이 없을 때만 새 문양으로 설정.
    const [g] = await tx
      .select({ activeId: guilds.activeEmblemId })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1);
    if (g?.activeId == null) {
      await tx
        .update(guilds)
        .set({ activeEmblemId: row!.id, emblemUrl, emblemColor: color })
        .where(eq(guilds.id, guildId));
    }
    return { emblemId: row!.id, emblemUrl };
  });
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
  // 스토리지 파일 정리(best-effort) — url에서 키 추출(경로=uuid).
  const key = storageKeyFromUrl(target.emblemUrl);
  if (key) await serviceClient().storage.from(BUCKET).remove([key]).catch(() => {});
}
