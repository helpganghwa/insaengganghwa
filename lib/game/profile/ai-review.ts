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
import { z } from 'zod';

const MODEL_ID = 'claude-haiku-4-5-20251001';

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

You are NOT an aesthetic-quality judge. You are NOT a description-match judge. The user is the aesthetic judge — if they don't like the look, they pay again to retry. That's already in the system.

INPUT:
- MULTIPLE images: 8 rotation views (south, south_east, east, north_east, north, north_west, west, south_west) of the SAME pixel art character (~256x256 PNG each), each labeled with its view.
- Description: optional context (you may IGNORE this for the decision — it's just background).

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

NOT a defect (PASS) — do NOT fail for these:
- A body part hidden by the viewing angle (back view shows no face/eyes; a turned pose hides one arm or one eye). Fewer-than-normal parts due to perspective is NORMAL.
- Body proportions different from description (chibi, big head, short legs)
- Art style softer/harder/different than expected; missing accessories or colors
- Character looks "off" but is still a coherent single humanoid with correct part counts
- A weapon, tool, or accessory that resembles a limb but is an object — this is COMMON and must NOT be failed. Treat these as objects, NEVER as extra arms/legs: a held bow (its two curved limbs + string read like thin arms), a staff/spear/sword held across the body, a folded or open fan, a quiver, a cape/mantle/cloak edge, shoulder spikes, a sash or belt tassel hanging at the hip, ribbons, scarves, long sleeves, and flowing dress/skirt panels that flare to the side.

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
  const content: Anthropic.MessageParam['content'] = [];
  for (const img of input.images) {
    content.push({ type: 'text', text: `View: ${img.direction}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: img.png.toString('base64') },
    });
  }
  content.push({
    type: 'text',
    text: `Description used:\n\n${input.descriptionPrompt}\n\nThe ${input.images.length} images above are rotation views of the SAME character. Check every view for anatomical part-count defects. Decide pass/fail. Output JSON only.`,
  });

  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content }],
  });

  const textBlock = res.content.find((b) => b.type === 'text');
  const raw = textBlock && 'text' in textBlock ? textBlock.text : '';

  // JSON 추출 — 모델이 fence(```json) 또는 prefix를 붙이는 케이스 방어.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`AI_REVIEW_PARSE_FAIL: no JSON in response: ${raw.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`AI_REVIEW_PARSE_FAIL: invalid JSON: ${(e as Error).message}`);
  }
  const verdict = ReviewVerdictSchema.parse(parsed);

  return {
    verdict,
    raw,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? undefined,
    },
  };
}
