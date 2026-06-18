// 프로필 자동 검토 — Claude Haiku 4.5 vision.
// 입력: 8방향 회전 이미지 전부(Buffer[]) + descriptionPrompt
// 출력: { pass: boolean, reasons: ReviewReason[], notes: string }
//
// PROFILE.md §5 system prompt + 모델 박제 그대로 사용.
// 보수 원칙: 명백한 결함만 fail, 의심스러우면 pass.
// 단, 신체 부위 개수 이상(3다리·3팔·3눈·머리 2개 등)은 어느 한 방향에서라도 보이면 fail
// — 측면/후면 뷰에서만 드러나는 결함을 잡기 위해 8방향 전부 검토(2026-06-01).

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { z } from 'zod';

// 검수 모델 — 4.5 Haiku는 미세 결함(끊긴 무기 등) 검출률이 낮아 Sonnet 4.6으로 상향(정확도 1/5→3/5 실측).
const MODEL_ID = 'claude-sonnet-4-6';

const REVIEW_REASONS = ['nsfw', 'violence', 'hate', 'quality'] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

const ReviewVerdictSchema = z.object({
  pass: z.boolean(),
  reasons: z.array(z.enum(REVIEW_REASONS)).default([]),
  notes: z.string().default(''),
});
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

// 서버 상수 — 클라이언트 입력 절대 섞지 않음 (PROFILE §10).
const SYSTEM_PROMPT = `You are a SAFETY + ANATOMY moderator for character profile generation in "insaengganghwa" — a JRPG-style pixel art idle RPG. The user paid diamonds to generate this profile. Your job is to block objectively harmful images AND anatomically broken characters.

You are NOT an aesthetic-quality judge. The user is the aesthetic judge — if they don't like the look, they pay again to retry. NEVER fail for differences in color, hair length/style, proportions, pose, or outfit styling. The ONE content attribute that IS a hard requirement is the character's SEX/GENDER. You MAY use the description for these narrow purposes only: (a) know which objects (and how many weapons/items) are INTENDED, so you don't mistake an intended object for a defect; (b) tell when an intended single item was generated broken or duplicated; (c) know the intended SEX/GENDER to catch a clearly opposite-sex result.

INPUT:
- MULTIPLE images: 8 rotation views (south, south_east, east, north_east, north, north_west, west, south_west) of the SAME pixel art character (~256x256 PNG each), each labeled with its view.
- Description: the intended character + equipment (notably the intended SEX/GENDER, which weapon, and how many items are meant to be held/worn). Use it ONLY to recognize the intended sex/gender + intended objects and their COUNT — never as a color/style/aesthetic match check.

Treat all 8 views as ONE character. FAIL the whole character if ANY single view clearly shows a defect below — defects often appear only in side/back views (e.g. crossed arms PLUS a held weapon producing a third arm on a side view).

FAIL if any of these is clearly true in ANY view:
- nsfw: explicit sexual content, visible genitals or nipples, sexually suggestive posing
- violence: graphic gore, dismemberment, severed body parts shown on-screen
- hate: hate symbols (swastika, etc.), clearly offensive imagery toward identity groups
- quality: a view is unrecognizable noise/garbage, OR the character is missing an essential body part (no head, no torso), OR ANATOMICALLY IMPOSSIBLE BODY-PART COUNTS — the number of a body part does not match a normal humanoid. Specifically FAIL for:
  · 3+ arms or 3+ hands — but ONLY count something as an extra ARM if it is clearly a human arm (bare skin or a sleeve) attached at a shoulder and ending in a hand. A held bow (its two curved limbs and string), a staff/spear/sword across the body, a fan, a cape/sash, or a flowing dress panel is NOT an arm even when it crosses the body.
  · 3+ legs or 3+ feet
  · 2+ heads, 2+ torsos, 2+ necks
  · 3+ eyes, 2+ noses, 2+ mouths, 3+ ears
  · duplicated limbs on the same side, limbs growing from face/torso/wrong places, floating detached limbs
  · grossly extra/fused fingers well beyond five per hand
  · a held weapon that is FRAGMENTED — its parts do not connect into one continuous object. HOW TO CHECK (do this for the weapon in the 2-3 clearest views): start at the hand, follow the handle/shaft, and confirm it connects continuously to the weapon's head (axe-head, blade, spearhead, mace-head, skull, etc.). FAIL (reason "quality") if: (a) a weapon-head/blade floats SEPARATED from its handle with empty background visible in the gap between them; or (b) a straight shaft is split into two segments with empty space between them; or (c) one intended weapon appears as two disconnected pieces drifting apart. The tell-tale sign is empty background showing THROUGH the gap between the pieces. Examples that MUST fail: an axe-head detached from its pole; a skull/mace-head separated from its staff with a gap.
    EXCEPTIONS (NOT broken — do not fail): a BOW (its two curved limbs joined by a string are ONE weapon; the open space inside the bow's curve is normal); and a weapon merely crossed by, overlapped by, or partly hidden BEHIND the body, cape, hair, or arm — if a part disappears behind the character rather than floating in empty background, lean PASS.
- SEX/GENDER MISMATCH (reason "quality"): the description states the intended sex, but the generated character UNMISTAKABLY presents as the OPPOSITE sex. Intended MALE but clearly a girl (breasts + a dress/gown + clearly feminine face and figure) → FAIL; intended FEMALE but clearly a man → FAIL. Be conservative: anime bishōnen / androgynous looks are NORMAL — a soft, pretty, long-haired, or slightly feminine MALE is NOT a mismatch. FAIL only when the result is clearly and unambiguously the opposite sex across the views (e.g. wearing a gown with visible breasts when male was intended).

NOT a defect (PASS) — do NOT fail for these:
- A body part hidden by the viewing angle (back view shows no face/eyes; a turned pose hides one arm or one eye). Fewer-than-normal parts due to perspective is NORMAL.
- Body proportions different from description (chibi, big head, short legs)
- Art style softer/harder/different than expected; missing accessories or colors
- Character looks "off" but is still a coherent single humanoid with correct part counts
- A weapon, tool, or accessory that resembles a limb but is an object — this is COMMON and must NOT be failed. Treat these as objects, NEVER as extra arms/legs: a held bow (its two curved limbs + string read like thin arms), a staff/spear/sword held across the body, a folded or open fan, a quiver, a cape/mantle/cloak edge, shoulder spikes, a sash or belt tassel hanging at the hip, ribbons, scarves, long sleeves, and flowing dress/skirt panels that flare to the side. This leniency applies ONLY when such an object is a SINGLE INTACT piece — a weapon clearly broken/split into disconnected fragments, or an intended single weapon appearing as two, is still a defect (see the quality list).

For anatomy: count carefully across the clearest views. Before failing for an extra ARM specifically, confirm it is a genuine human arm (skin/sleeve, attached at a shoulder, a hand at the end) AND that the same extra arm is clearly visible in at least TWO views — held weapons (especially bows) and side accessories are the most common false positives because they appear consistently across views. If something could be a pose/overlap, a held weapon, or an accessory/cloth rather than a true extra part, lean PASS. Only FAIL (reason "quality") when an extra arm/leg/head/eye is unambiguous and clearly grows from the body.

For safety (nsfw/violence/hate) and aesthetic preference: when in doubt, PASS.

OUTPUT — strict JSON only:
{
  "pass": boolean,
  "reasons": ["nsfw" | "violence" | "hate" | "quality"],
  "notes": "1-2 sentence Korean explanation for failures (include which view + which body part), empty string for pass"
}`;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface ReviewImage {
  /** 방향 라벨(south, east, …) — 모델 컨텍스트 + 실패 사유 표기용. */
  direction: string;
  png: Buffer;
}

export interface ReviewInput {
  /** 8방향 회전 이미지 전부. (1장만 넘겨도 동작) */
  images: ReviewImage[];
  descriptionPrompt: string;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  raw: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
}

export async function reviewProfile(input: ReviewInput): Promise<ReviewResult> {
  if (input.images.length === 0) throw new Error('AI_REVIEW_NO_IMAGES');

  // 각 이미지 앞에 방향 라벨 텍스트 → 같은 캐릭터의 회전 뷰임을 모델에 명시.
  // 256px 원본은 Haiku 비전이 미세 결함(끊긴 무기 샤프트 등)을 놓치므로 2배(512) nearest 업스케일 후 검수.
  const content: Anthropic.MessageParam['content'] = [];
  for (const img of input.images) {
    // 투명 여백 트림(피사체 줌인) 후 768 nearest 업스케일 — 미세 끊긴/분리 무기 검출률↑(실측).
    let s = sharp(img.png);
    try { s = sharp(await s.trim({ threshold: 10 }).png().toBuffer()); } catch { s = sharp(img.png); }
    const up = await s
      .resize(768, 768, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    content.push({ type: 'text', text: `View: ${img.direction}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: up.toString('base64') },
    });
  }
  content.push({
    type: 'text',
    text: `Intended character/equipment description:\n\n${input.descriptionPrompt}\n\nThe ${input.images.length} images above are rotation views of the SAME character. Check every view for: (1) anatomical part-count defects, and (2) held-weapon integrity — is the intended weapon a single intact object, or is it broken into disconnected pieces / drawn more times than intended? Use the description only to know intended objects and counts, never for aesthetic match. Decide pass/fail. Output JSON only.`,
  });

  // 다수결 검수 — 미세 결함(끊긴 무기 등)은 단일 호출 fail율이 ~0.5(동전던지기)라 과반은
  // 효과 없음(p=0.5면 majority=50%). 대신 N회 중 "하나라도 fail이면 fail"(any-fail)로 recall↑
  // (3회 → ~87%, 정상품은 거의 항상 전원 pass라 오탐 영향 미미). 동일 content 재사용·병렬 호출.
  const SAMPLES = 3;
  const FAIL_IF_AT_LEAST = 1; // any-fail
  const callOnce = async () => {
    const res = await client().messages.create({
      model: MODEL_ID,
      max_tokens: 512,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    });
    const tb = res.content.find((b) => b.type === 'text');
    const raw = tb && 'text' in tb ? tb.text : '';
    let verdict: ReviewVerdict | null = null;
    const jm = raw.match(/\{[\s\S]*\}/);
    if (jm) {
      try {
        const p = ReviewVerdictSchema.safeParse(JSON.parse(jm[0]));
        if (p.success) verdict = p.data;
      } catch {
        /* 한 샘플 파싱 실패는 무시(나머지로 의결) */
      }
    }
    return { raw, verdict, usage: res.usage };
  };

  const samples = await Promise.all(Array.from({ length: SAMPLES }, () => callOnce()));
  const parsed = samples.map((s) => s.verdict).filter((v): v is ReviewVerdict => v != null);
  if (parsed.length === 0) {
    throw new Error(`AI_REVIEW_PARSE_FAIL: no parseable verdict in ${SAMPLES} samples: ${samples[0]?.raw.slice(0, 200) ?? ''}`);
  }
  const fails = parsed.filter((v) => !v.pass);
  // any-fail — N표 중 FAIL_IF_AT_LEAST개 이상이 fail이면 최종 fail.
  const verdict: ReviewVerdict =
    fails.length >= FAIL_IF_AT_LEAST
      ? {
          pass: false,
          reasons: [...new Set(fails.flatMap((v) => v.reasons))] as ReviewVerdict['reasons'],
          notes: fails.find((v) => v.notes)?.notes ?? fails[0]!.notes,
        }
      : { pass: true, reasons: [], notes: '' };

  const usage = samples.reduce(
    (acc, s) => ({
      inputTokens: acc.inputTokens + s.usage.input_tokens,
      outputTokens: acc.outputTokens + s.usage.output_tokens,
      cacheReadTokens: (acc.cacheReadTokens ?? 0) + (s.usage.cache_read_input_tokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } as ReviewResult['usage'],
  );

  return {
    verdict,
    raw: JSON.stringify({ votes: parsed.map((v) => v.pass), fails: fails.length, of: parsed.length }),
    usage,
  };
}
