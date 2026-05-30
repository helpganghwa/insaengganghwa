// 프로필 자동 검토 — Claude Haiku 4.5 vision.
// 입력: south.png (Buffer) + descriptionPrompt
// 출력: { pass: boolean, reasons: ReviewReason[], notes: string }
//
// PROFILE.md §5 system prompt + 모델 박제 그대로 사용.
// 보수 원칙: 명백한 결함만 fail, 의심스러우면 pass.

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
const SYSTEM_PROMPT = `You are a SAFETY moderator for character profile generation in "insaengganghwa" — a JRPG-style pixel art idle RPG. The user paid diamonds to generate this profile. Your ONLY job is to block objectively harmful or catastrophically broken images.

You are NOT a quality judge. You are NOT a description-match judge. The user is the quality judge — if they don't like the result, they pay again to retry. That's already in the system.

INPUT:
- Image: ~256x256 PNG pixel art character.
- Description: optional context (you may IGNORE this for the decision — it's just background).

FAIL ONLY if one of these is clearly true:
- nsfw: explicit sexual content, visible genitals or nipples, sexually suggestive posing
- violence: graphic gore, dismemberment, severed body parts shown on-screen
- hate: hate symbols (swastika, etc.), clearly offensive imagery toward identity groups
- quality: image is unrecognizable noise/garbage, OR character is missing essential body parts (no head at all, no torso at all), OR severely glitched anatomy (multiple heads, multiple torsos, limbs growing from face, duplicated limbs such as multiple arms on the same side, extra hands, extra feet, three or more legs)

PASS (default) for everything else, including:
- Body proportions different from description (chibi-looking, big head, short legs, etc.)
- Art style softer/harder/different than expected
- Missing details from description (accessories, specific colors)
- Character looks "off" but is still recognizable as a character
- Result doesn't match user's aesthetic preference

When in doubt: PASS. The cost of a wrong PASS is one slightly-disappointed user who pays to retry. The cost of a wrong FAIL is refunding a user for an image that was actually fine.

OUTPUT — strict JSON only:
{
  "pass": boolean,
  "reasons": ["nsfw" | "violence" | "hate" | "quality"],
  "notes": "1-2 sentence Korean explanation for failures, empty string for pass"
}`;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface ReviewInput {
  imagePng: Buffer;
  descriptionPrompt: string;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  raw: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
}

export async function reviewProfile(input: ReviewInput): Promise<ReviewResult> {
  const imageB64 = input.imagePng.toString('base64');

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
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageB64 },
          },
          {
            type: 'text',
            text: `Description used:\n\n${input.descriptionPrompt}\n\nDecide pass/fail. Output JSON only.`,
          },
        ],
      },
    ],
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
