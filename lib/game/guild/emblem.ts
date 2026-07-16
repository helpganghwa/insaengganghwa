import 'server-only';

import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, desc, lt, sql } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { walletTrySpend, walletAdd } from '@/lib/game/wallet';
import { guilds, guildMembers, guildEmblems, guildEmblemEscrows } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { pixellabKeyByIdx, pickPixellabKeyIdx } from '@/lib/game/profile/pixellab-keys';

import { GUILD_EMBLEM_REROLL_COST_DIAMOND, MAX_GUILD_EMBLEMS } from './balance';
import { GuildError } from './errors';
import {
  buildEmblemPrompt,
  mainColor,
  isShieldShape,
  EMBLEM_SHAPES,
  EMBLEM_TONES,
  EMBLEM_KEYWORDS,
  type EmblemSelection,
} from './emblem-vocab';

// ── AI 프롬프트 생성(Sonnet 5) — 선택값을 코히어런트한 픽셀 엠블럼 영문 프롬프트로 변환. 실패 시 템플릿 폴백. ──
const EMBLEM_PROMPT_MODEL = 'claude-sonnet-5';
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
- SHAPE FIDELITY (critical): the given shape is the overall OUTER SILHOUETTE of the whole emblem and is MANDATORY — it must be immediately recognizable as that exact shape. If the shape is NOT a shield (e.g. a lozenge/diamond/rhombus, or a hanging banner), do NOT draw a shield or escutcheon — keep the non-shield silhouette. The MAIN color fills a large solid field/backing behind the charge; the SUB color is the charge, accents, border and trim.
- Palette: exactly two colors dominate — the MAIN color as a large SOLID field/backing that visibly covers a big portion of the emblem (if the central motif would otherwise fill everything, seat it on a MAIN-colored roundel/plaque/field so the main color is ALWAYS plainly visible, never reduced to a thin outline or omitted), and the SUB color as the charge/accents/border/trim; a few tiny extra accents are okay, not a busy rainbow.
- Detail: highly detailed, intricate ornate filigree and fine engraved linework, crisp clean pixel detail, rich shading and metallic depth, embossed relief.
- Compose everything into ONE unified crest — do NOT scatter unrelated floating objects.
- Always include: bold clean readable silhouette, fills the frame, centered, no text, no lettering. Only the area OUTSIDE the emblem's outer silhouette is transparent — inside, the main-colored field is solid (not transparent).`;

async function buildEmblemPromptAI(s: EmblemSelection): Promise<string> {
  try {
    const shape = EMBLEM_SHAPES.find((x) => x.id === s.shapeId)?.en ?? 'a round shield';
    const main = EMBLEM_TONES.find((x) => x.id === s.mainToneId)?.en ?? 'crimson';
    const sub = EMBLEM_TONES.find((x) => x.id === s.subToneId)?.en ?? 'gold';
    const mainKw = EMBLEM_KEYWORDS.find((x) => x.id === s.mainKeywordId)?.en ?? 'a dragon';
    const subKw = s.subKeywordId ? EMBLEM_KEYWORDS.find((x) => x.id === s.subKeywordId)?.en : null;
    // 방패가 아닌 모양(마름모·깃발)은 모델 기본값(방패)에 묻히므로 외곽 실루엣을 강하게 못박는다.
    const shapeNote = isShieldShape(s.shapeId)
      ? ''
      : `\nIMPORTANT: this shape is NOT a shield. The entire emblem's outer silhouette MUST be ${shape}. Never draw a shield/escutcheon/heater shield.`;
    const res = await anthropic().messages.create({
      model: EMBLEM_PROMPT_MODEL,
      max_tokens: 220,
      system: [{ type: 'text', text: EMBLEM_PROMPT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content:
            `Shape (overall emblem silhouette, mandatory): ${shape}${shapeNote}\nMain color (large SOLID field/backing, must clearly dominate the emblem): ${main}\nSub color (charge/accents/trim): ${sub}\n` +
            `Main keyword (central charge, focal point): ${mainKw}\n` +
            `Sub keyword (secondary charge, must be clearly visible — e.g. flanking supporters): ${subKw ?? 'none'}\n\n` +
            `Write the one-line heraldic pixel guild emblem prompt.`,
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

// 내부 채움율 하한(2026-07-16) — 프롬프트가 '메인색 솔리드 필드 필수'인데 테두리+모티프만
// 그리고 속을 비운 산출물이 종종 나옴(라이브 #13·#21: 0.59~0.64, 정상 0.91~1.0). 행별
// [첫..끝 불투명] 스팬 대비 불투명 비율이라 방패/원형/마름모 등 외곽 모양과 무관.
const MIN_INTERIOR_FILL = 0.8;

/** 불투명 비율 + 내부 채움율이 정상 범위인지(빈/꽉참·속빈 결함 검출). 디코드 실패도 결함. */
async function emblemQualityOk(png: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const total = width * height;
    if (total === 0) return false;
    let opaque = 0;
    for (let i = 3; i < data.length; i += channels) if (data[i]! > OPAQUE_ALPHA) opaque++;
    const ratio = opaque / total;
    if (ratio < MIN_OPAQUE_RATIO || ratio > MAX_OPAQUE_RATIO) return false;
    // 내부 채움율 — 메인색 필드 누락(속 빈 문양) 검출.
    let span = 0;
    let inSpan = 0;
    for (let y = 0; y < height; y++) {
      let first = -1;
      let last = -1;
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * channels + 3]! > OPAQUE_ALPHA) {
          if (first < 0) first = x;
          last = x;
        }
      }
      if (first < 0) continue;
      for (let x = first; x <= last; x++) {
        if (data[(y * width + x) * channels + 3]! > OPAQUE_ALPHA) inSpan++;
      }
      span += last - first + 1;
    }
    return span > 0 && inSpan / span >= MIN_INTERIOR_FILL;
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

/** pixflux 128² no_background 생성 → PNG Buffer. 429는 백오프 재시도, 그 외 실패는 throw.
 *  shieldLike=false(마름모·깃발)면 negatives에 방패류를 추가해 모델 기본값(방패)을 밀어낸다. */
// startKeyIdx: 라운드로빈 시작 키(1|2). pixflux는 동기 단발 호출이라 아바타와 달리 키 일관성
// 제약이 없어(폴링 없음) 재시도마다 키를 교대한다 — 부하 분산 + 한쪽 키 429 시 다른 키로 failover.
// key2 미설정이면 pixellabKeyByIdx가 항상 key1 반환(단일 키 환경 무영향).
async function generateEmblemPng(prompt: string, shieldLike = true, startKeyIdx = 1): Promise<Buffer> {
  if (!process.env.PIXELLAB_API_KEY) throw new Error('PIXELLAB_API_KEY missing');
  const negative =
    'blurry, low detail, flat, plain, messy, cluttered, busy rainbow, text, letters, watermark, signature' +
    (shieldLike ? '' : ', shield, heater shield, round shield, escutcheon, shield shape');
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 4; attempt++) {
    const keyIdx = ((startKeyIdx - 1 + attempt) % 2) + 1; // 시작키에서 시도마다 1↔2 교대
    const key = pixellabKeyByIdx(keyIdx);
    // 행 방지 — Pixellab 무응답/쿼터초과 시 25초 후 abort(과거 300초 함수 타임아웃 유발). 빠른 실패→폴백.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(PIXFLUX_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          description: prompt,
          // 디테일↑(더 큰 캔버스 → 다운스케일), 프롬프트 충실도↑(색 팔레트·디테일 반영), 잡색·노이즈 회피.
          image_size: { width: 160, height: 160 },
          no_background: true,
          text_guidance_scale: 9,
          negative_description: negative,
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      lastErr =
        (e as Error)?.name === 'AbortError'
          ? 'timeout(25s)'
          : `fetch: ${(e as Error)?.message ?? 'unknown'}`;
      console.warn(`[guild.emblem] 요청 실패 재시도 (attempt ${attempt}, key${keyIdx}) — ${lastErr}`);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 700 * 2 ** attempt)); // 백오프 단축(긴 요청 단축)
      lastErr = `429 rate limit (key${keyIdx})`;
      continue; // 다음 시도는 교대된 키로 — 한쪽 키 포화 시 다른 키로 우회.
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
    .upload(path, png, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
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
  const shieldLike = isShieldShape(selection.shapeId);
  // 비방패(마름모·깃발)는 AI 재작성을 건너뛴다 — Haiku가 'coat of arms/crest'를 재주입해
  // 방패로 회귀시키는 게 주원인(라이브 검증). 결정적 템플릿(heraldry 단어 없음)으로 직행.
  const prompt = shieldLike ? await buildEmblemPromptAI(selection) : buildEmblemPrompt(selection);
  // 라운드로빈 시작 키 = 길드 id 패리티(아바타와 동일 키풀). 이후 재시도는 generateEmblemPng가 교대.
  const raw = await generateEmblemPng(prompt, shieldLike, pickPixellabKeyIdx(guildId));
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
async function requireLeaderGuild(userId: string, serverId: number): Promise<bigint> {
  const [m] = await db
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (m.role !== 'leader') throw new GuildError('NOT_LEADER');
  return m.guildId;
}

/** 문양 행 삽입 + (활성 문양이 없을 때만) 활성화. tx 안에서 호출. */
async function storeEmblemRow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  guildId: bigint,
  emblemUrl: string,
  color: string | null,
): Promise<{ emblemId: bigint; emblemUrl: string }> {
  const [row] = await tx
    .insert(guildEmblems)
    .values({ guildId, emblemUrl, emblemColor: color })
    .returning({ id: guildEmblems.id });
  // 사용 중 문양 유지 — 보관함에만 추가(활성은 그대로). 단 활성이 없을 때만 새 문양으로 설정.
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
}

/**
 * 에스크로 환불 — pending 예치를 환불(walletAdd) + refunded 마킹 + 실패 통지 우편. 멱등:
 * FOR UPDATE 락 + status='pending' 확인으로 in-request/크론 이중 환불 방지(이미 해소면 no-op).
 */
async function refundEmblemEscrow(escrowId: bigint): Promise<void> {
  await db.transaction(async (tx) => {
    const [esc] = await tx
      .select()
      .from(guildEmblemEscrows)
      .where(eq(guildEmblemEscrows.id, escrowId))
      .for('update')
      .limit(1);
    if (!esc || esc.status !== 'pending') return; // 이미 completed/refunded — 멱등 no-op
    await tx
      .update(guildEmblemEscrows)
      .set({ status: 'refunded', resolvedAt: sql`now()` })
      .where(eq(guildEmblemEscrows.id, escrowId));
    await walletAdd(tx, esc.userId, esc.serverId, esc.amount); // 지갑 즉시 반환
    // 우편은 순수 통지(payload 빈값) — 다이아는 이미 walletAdd로 반환됨(중복 지급 금지).
    await tx.insert(mailbox).values({
      userId: esc.userId,
      serverId: esc.serverId,
      type: 'guild',
      title: '문양 생성 실패 — 다이아 환불',
      body: `문양 생성이 일시적으로 실패해 ${esc.amount.toString()}💎를 돌려드렸어요. 잠시 후 다시 시도해 주세요.`,
      senderLabel: '길드',
      payload: {},
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  });
}

/**
 * 새 문양 생성·보관 — 길드장만. **첫 문양은 무료**(결성 시 무료 문양이 best-effort로 실패한
 * 길드의 복구 경로), 2번째+(재생성)는 3,000💎(💎 sink·외형 BM). 보관 최대 미만일 때만.
 *
 * 유료 경로는 **에스크로**(2026-07-13): 클릭 즉시 차감+pending 기록 → 생성 중 다른 행위로 잔액이
 * 내려가도(TOCTOU) 영향 없음 → 성공 시 completed, 실패 시 환불+우편 후 refunded. 예치~해소 사이
 * 함수 사망 시 pending 잔존분은 reconcile 크론이 6분(>maxDuration 180s) 경과 후 환불.
 * 무료(첫 문양)는 차감이 없어 에스크로 없이 성공 시에만 삽입.
 */
export async function generateEmblem(input: {
  userId: string;
  serverId: number;
  selection: EmblemSelection;
}): Promise<{ emblemId: bigint; emblemUrl: string }> {
  const rerollCost = BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND);
  const guildId = await requireLeaderGuild(input.userId, input.serverId);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guildEmblems)
    .where(eq(guildEmblems.guildId, guildId));
  if (n >= MAX_GUILD_EMBLEMS) throw new GuildError('EMBLEM_MAX');
  const cost = n === 0 ? 0n : rerollCost; // 첫 문양 무료

  // 무료 경로 — 차감 없음. 생성 성공 시에만 삽입(실패해도 차감/빈 행 없음).
  if (cost === 0n) {
    const { emblemUrl, color } = await generateEmblemAsset(guildId, input.selection);
    return db.transaction((tx) => storeEmblemRow(tx, guildId, emblemUrl, color));
  }

  // 유료 경로 1) 에스크로 — 클릭 즉시 차감 + pending 기록(원자적). 잔액 부족이면 여기서 실패(생성 전).
  const escrowId = await db.transaction(async (tx) => {
    const [{ n: n2 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guildEmblems)
      .where(eq(guildEmblems.guildId, guildId));
    if (n2 >= MAX_GUILD_EMBLEMS) throw new GuildError('EMBLEM_MAX');
    const paid = await walletTrySpend(tx, input.userId, input.serverId, cost);
    if (!paid) throw new GuildError('INSUFFICIENT_DIAMOND');
    const [row] = await tx
      .insert(guildEmblemEscrows)
      .values({ serverId: input.serverId, guildId, userId: input.userId, amount: cost })
      .returning({ id: guildEmblemEscrows.id });
    return row!.id;
  });

  // 2) 생성(예치 후) — 실패하면 환불+우편 후 rethrow(라우트가 EMBLEM_GEN_FAILED로 매핑).
  let asset: { emblemUrl: string; color: string | null };
  try {
    asset = await generateEmblemAsset(guildId, input.selection);
  } catch (e) {
    await refundEmblemEscrow(escrowId);
    throw e;
  }

  // 3) 생성 성공 — escrow completed(예치는 이미 차감됨) + 문양 삽입/활성화. 임계(6분)>maxDuration이라
  //    크론이 먼저 환불하는 경쟁은 사실상 없음. 만에 하나 이미 환불됐으면 유저에 유리하게 문양은 지급.
  return db.transaction(async (tx) => {
    const upd = await tx
      .update(guildEmblemEscrows)
      .set({ status: 'completed', resolvedAt: sql`now()` })
      .where(and(eq(guildEmblemEscrows.id, escrowId), eq(guildEmblemEscrows.status, 'pending')))
      .returning({ id: guildEmblemEscrows.id });
    if (upd.length === 0) {
      console.warn(`[guild.emblem] escrow ${escrowId} 이미 해소됨 — 문양은 지급(사실상 무료)`);
    }
    return storeEmblemRow(tx, guildId, asset.emblemUrl, asset.color);
  });
}

/**
 * 미해소 에스크로 reconcile — 예치~해소 사이 함수 사망으로 pending에 남은 예치를 환불(크론에서 호출).
 * 임계 6분(>maxDuration 180s)이라 진행 중인 정상 요청은 절대 건드리지 않음. 환불 처리 건수 반환.
 */
export async function reconcileStuckEmblemEscrows(maxItems = 20): Promise<number> {
  const stuck = await db
    .select({ id: guildEmblemEscrows.id })
    .from(guildEmblemEscrows)
    .where(
      and(
        eq(guildEmblemEscrows.status, 'pending'),
        lt(guildEmblemEscrows.createdAt, sql`now() - interval '6 minutes'`),
      ),
    )
    .orderBy(guildEmblemEscrows.createdAt)
    .limit(maxItems);
  let refunded = 0;
  for (const s of stuck) {
    // 건별 격리 — 한 건 실패(탈퇴로 캐릭터 부재 등)가 뒤 건들의 환불을 막지 않게. 실패 건은
    // pending으로 남아 다음 주기 재시도(로그로 수동 개입 신호).
    try {
      await refundEmblemEscrow(s.id);
      refunded++;
    } catch (e) {
      console.error(`[guild.emblem] escrow ${s.id} 환불 실패 — 다음 주기 재시도`, (e as Error).message);
    }
  }
  return refunded;
}

/** 보관 문양 중 하나를 활성으로 선택 — 길드장만, 무료. */
export async function setActiveEmblem(input: { userId: string; serverId: number; emblemId: bigint }): Promise<void> {
  const guildId = await requireLeaderGuild(input.userId, input.serverId);
  const [em] = await db
    .select({ id: guildEmblems.id, emblemUrl: guildEmblems.emblemUrl, emblemColor: guildEmblems.emblemColor })
    .from(guildEmblems)
    .where(and(eq(guildEmblems.id, input.emblemId), eq(guildEmblems.guildId, guildId)))
    .limit(1);
  if (!em) throw new GuildError('EMBLEM_NOT_FOUND');
  await setGuildActiveEmblem(guildId, em);
}

/** 보관 문양 삭제 — 길드장만, 무료. 최소 1개 유지. 활성 삭제 시 다른 문양으로 활성 이전. */
export async function deleteEmblem(input: { userId: string; serverId: number; emblemId: bigint }): Promise<void> {
  const guildId = await requireLeaderGuild(input.userId, input.serverId);
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
