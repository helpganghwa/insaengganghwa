// 의상/헤어 절 생성 — Claude Haiku 4.5 (text-only).
// composeEditDescription의 "가변 블록"만 담당: 모티프·종족·성별·머리길이를 받아
// 캐릭터의 헤어스타일+전체 의상을 묘사하는 영어 절 1개를 매번 다르게 생성.
// 고정 골격(KEEP source·비율·full body·흰점·pose)은 compose.ts가 책임.
// 실패(키 없음·API 오류·빈 응답)는 throw — 상위(compose.ts)가 정적 절로 fallback.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

const MODEL_ID = 'claude-haiku-4-5-20251001';

// 의상 절 최대 길이 — edit_description 1000자 한도 내 고정 골격(~560자)과 공존.
const MAX_CLAUSE_CHARS = 340;

// 서버 상수 — 클라이언트 입력 절대 섞지 않음 (PROFILE §10).
const SYSTEM_PROMPT = `You are a costume designer for "insaengganghwa", an anime/JRPG-style pixel-art idle RPG. For each request you invent ONE fresh, vivid English clause describing a character's HAIRSTYLE and full OUTFIT.

STRICT RULES:
- Describe ONLY: hairstyle (style + color, within the given length) and the worn outfit (clothing, footwear, accessories, small decorations).
- NEVER mention: face, eyes, expression, body, proportions, height, pose, hands, background, camera, art style, or the words "full body".
- Weave the given motifs in as DESIGN ELEMENTS, never as literal held weapons or worn armor pieces. e.g. "dragon" → scale-pattern embroidery / horn-shaped hair clips; "frog, green" → green tones, lily/leaf trim; a color → use it in the palette.
- Anime/JRPG fantasy aesthetic: stylish game-character look. Vary the genre every time (regal, elegant, casual, school, battle-casual, ceremonial, idol...). Be creative and clearly different each call.
- One flowing clause, concrete and visual. Max 48 words. Output ONLY the clause — no preamble, no quotes, no trailing period needed.`;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface OutfitClauseInput {
  gender: 'male' | 'female';
  /** 종족 모티프 개념(human은 ''). cat/dragon/fairy 등 — 귀·날개 등 변별로 활용. */
  raceMotif: string;
  /** 머리 길이 영어 묘사 — Haiku는 이 길이 안에서 스타일·색만 변형. */
  hairLengthDesc: string;
  /** 장비 3종 모티프(색 포함, 풍부한 입력). 예: "dragon, gold, pearl; frog, green". */
  motifs: string;
}

/** Haiku로 의상/헤어 절 생성. 실패 시 throw — 상위에서 정적 fallback. */
export async function generateOutfitClause(input: OutfitClauseInput): Promise<string> {
  const userMsg = [
    `Gender: ${input.gender}`,
    input.raceMotif ? `Race flavor (subtly include): ${input.raceMotif}` : `Race flavor: ordinary human`,
    `Hair length (fixed): ${input.hairLengthDesc}`,
    `Motifs to weave in: ${input.motifs || 'none — free creative outfit'}`,
    ``,
    `Write the hairstyle + outfit clause now.`,
  ].join('\n');

  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 200,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });

  const textBlock = res.content.find((b) => b.type === 'text');
  const raw = (textBlock && 'text' in textBlock ? textBlock.text : '').trim();
  if (!raw) throw new Error('OUTFIT_LLM_EMPTY');

  // 따옴표·줄바꿈·끝 마침표 정리 + 길이 캡(마지막 단어 경계).
  let clause = raw
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
  if (clause.length > MAX_CLAUSE_CHARS) {
    const cut = clause.slice(0, MAX_CLAUSE_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    clause = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return clause;
}
