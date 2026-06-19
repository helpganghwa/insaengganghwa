// PROFILE v3 — Claude(프롬프트 생성 AI) 조합 단계.
// 장비 3종(시그니처 묘사) + 성별 + 랜덤 외형(종족/헤어/표정)을 받아, create-character-v3용
// 단일 영문 description을 작성한다. 규칙:
//  - 비율 최우선: heroic 8등신·작은 머리·긴 다리·머리 부속(귀·뿔·관) 작게.
//  - 미소녀(여)/미소년(남) youthful. 남성은 모든 의상을 남성복으로(드레스/가운 금지).
//  - 장비 "특색"은 충실히 보존(고유 실루엣·색·시그니처). 다양성은 장비 외 주변
//    (베이스 의상·레이어·포즈·악센트 컬러) + 랜덤 외형에서 — 장비를 흐리지 않는다.
//  - 부정형 회피, "cute/chibi/adult/mature/grown" 미사용. enhance_prompt는 OFF로 쓰므로
//    이 description이 최종 프롬프트(서버 확장 없음) — 너무 길면 품질↓이라 간결 유지.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

import type { ProfileGender } from './refs';
import type { Appearance } from './appearance-v3';

const MODEL_ID = 'claude-sonnet-4-6';
// v3 spec 2000자 한도이나, 긴 프롬프트는 품질↓ → 여유 두고 캡.
const MAX_CHARS = 1400;

const PROP = `PROPORTIONS ARE THE TOP PRIORITY — a statuesque, heroic 8-heads-tall figure: a small head (about one-eighth of the total body height), a slender neck, a compact torso, and very long legs (roughly half the total height) with a high waistline. Tall, slim and elongated like an anime key-visual idol. Keep ALL head accessories small and neat — ears, horns, crowns and headpieces stay modest so the head reads small.`;

const MENS = `Render ALL attire as MENSWEAR — a fitted coat or tunic with trousers and boots, in the items' colors, materials and motifs; keep everything masculine and avoid dresses, gowns or skirts.`;

function systemPrompt(gender: ProfileGender): string {
  const male = gender === 'male';
  return `You are an expert prompt engineer for Pixellab create-character-v3 (pixel-art). Write ONE concise English image prompt (about 520-680 characters) for a single FULL-BODY Japanese-anime pixel-art avatar.
${PROP}
SUBJECT: a beautiful YOUTHFUL ${
    male
      ? "bishonen, a pretty slender teenage anime boy, clearly male with a flat masculine chest, a lean youthful build and a masculine hairstyle"
      : 'bishojo, a pretty slender teenage anime girl, clearly female'
  } of the given race, with the given hair and expression, and a pretty youthful face with big expressive eyes.
${male ? MENS + '\n' : ''}COMPOSITION: full-length from the top of the head to the soles of the feet, standing upright, centered with clear margin above and below, both feet visible, front view, transparent background, solo.
STYLE: clean cel-shaded Japanese anime, bright vibrant flat colors.
EQUIPMENT (preserve its character): render the three signature items FAITHFULLY and clearly — keep each item's exact silhouette, colors and signature features so it is instantly recognizable. To create variety, freely vary EVERYTHING ELSE around them — the base outfit and layers, secondary accessories, accent colors and stance — so each character feels distinct, while the three items stay faithful.
Write ONLY positive visual description; never use the words cute, chibi, adult, mature or grown. Output ONLY the prompt text, no preamble or quotes.`;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface ComposeV3Input {
  gender: ProfileGender;
  appearance: Appearance;
  /** 장비 시그니처 묘사(특색 보존 — 색·형태·특징). */
  weapon: string;
  armor: string;
  accessory: string;
}

/** Claude로 v3용 description 생성. 실패(빈 응답)는 throw — 상위에서 처리. */
export async function composeV3Description(input: ComposeV3Input): Promise<string> {
  const { gender, appearance: ap, weapon, armor, accessory } = input;
  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 600,
    system: [{ type: 'text', text: systemPrompt(gender), cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Race: ${ap.race}. Hair: ${ap.hair} hair. Expression: ${ap.expression}. Equipment — weapon: ${weapon}; armor: ${armor}; accessory: ${accessory}. Write the prompt.`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  let desc = (block && 'text' in block ? block.text : '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!desc) throw new Error('COMPOSE_V3_EMPTY');
  if (desc.length > MAX_CHARS) {
    const cut = desc.slice(0, MAX_CHARS);
    const sp = cut.lastIndexOf(' ');
    desc = (sp > 0 ? cut.slice(0, sp) : cut).trim();
  }
  return desc;
}
