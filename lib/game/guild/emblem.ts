import 'server-only';

import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { profiles } from '@/lib/db/schema/profiles';
import { sql } from 'drizzle-orm';

import { GUILD_EMBLEM_REROLL_COST_DIAMOND } from './balance';
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

/** 버킷 보장(멱등) → 업로드(upsert) → public URL(+캐시버스트). */
async function uploadEmblem(guildId: bigint, png: Buffer): Promise<string> {
  const supabase = serviceClient();
  // 멱등 — 이미 있으면 에러 무시.
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const path = `${guildId}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, png, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // 재생성 시 동일 경로 → CDN 캐시 버스트(시각 쿼리). 생성 시각은 서버 런타임 Date 허용.
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * 3축 선택 → 생성 → 업로드 → guilds 갱신. 성공 시 emblem_url/emblem_color 갱신.
 * 호출자는 try/catch로 best-effort 처리(실패해도 길드는 유지, 폴백 문양 노출).
 */
export async function generateAndStoreEmblem(input: {
  guildId: bigint;
  selection: EmblemSelection;
}): Promise<{ emblemUrl: string }> {
  const prompt = buildEmblemPrompt(input.selection);
  const png = await generateEmblemPng(prompt);
  const emblemUrl = await uploadEmblem(input.guildId, png);
  await db
    .update(guilds)
    .set({ emblemUrl, emblemColor: toneColor(input.selection.toneId) })
    .where(eq(guilds.id, input.guildId));
  return { emblemUrl };
}

/**
 * 문양 재생성 — GUILD §1.6. 길드장만, 5,000💎 차감(💎 sink·외형 BM). 생성 실패 시 환불.
 * 차감→생성→실패시 환불 패턴(외부 호출을 트랜잭션 밖에 둠).
 */
export async function rerollEmblem(input: {
  userId: string;
  selection: EmblemSelection;
}): Promise<{ emblemUrl: string }> {
  // 차감(길드장·잔액 검증) — 단일 트랜잭션.
  const guildId = await db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.userId))
      .limit(1);
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader') throw new GuildError('NOT_LEADER');

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
    return await generateAndStoreEmblem({ guildId, selection: input.selection });
  } catch (e) {
    // 생성 실패 → 환불.
    await db
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)}` })
      .where(eq(profiles.id, input.userId));
    throw e instanceof GuildError ? e : new GuildError('EMBLEM_GEN_FAILED');
  }
}
