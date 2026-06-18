// 장비 착용 프롬프트 생성 — Claude Haiku 4.5 vision (2026-05-29).
// 장비 3종(무기/방어구/장신구)의 실제 스프라이트 이미지 + 이름 + art(영문 외형)를 보여주고,
// 캐릭터가 그 장비를 실제로 착용/소지한 모습의 edit_description 절을 받는다 — 무기는 손에,
// 방어구는 몸에, 장신구는 착용. (기존: 모티프 텍스트만 → 엉뚱한 캐릭터 문제 해소)
// 고정 골격(KEEP source·비율·full body·흰점·pose)은 compose.ts가 책임.
// 실패(키 없음·API 오류·빈 응답)는 throw — 상위(compose.ts)가 정적 fallback.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

const MODEL_ID = 'claude-haiku-4-5-20251001';
const MAX_CLAUSE_CHARS = 330; // 골격(2팔 명시 추가)+prefix+절=~993 < 1000. 의상절 절삭(장비 컨셉 누락) 방지.

const SYSTEM_PROMPT = `You are a character designer for "insaengganghwa", an anime/JRPG pixel-art idle RPG. You are shown a character's THREE equipped items as images — a WEAPON, an ARMOR, and an ACCESSORY — each with its name and an art-keyword note. Write ONE English clause describing the character ACTUALLY EQUIPPED with these exact items, for a pixel-art generation prompt.

STRICT RULES:
- The character must visibly WIELD the weapon (held in hand), WEAR the armor (as the outfit on the body), and WEAR the accessory. Describe each item concretely FROM ITS IMAGE (shape, material, colors, key features) so it is recognizable on the character — do not invent unrelated gear.
- Make the WHOLE outfit look lavish and cohesive: fill in the base layers the armor leaves bare (under-garment, sleeves, legwear, boots, gloves) with ornate fantasy detail and colors that harmonize with the equipment. NEVER plain, drab, or everyday clothing — the entire ensemble must match the rich, elaborate quality of the weapon, armor, and accessory.
- GENDER-APPROPRIATE (critical): render the outfit to match the character's stated Gender. For a MALE character, adapt ANY feminine garment (dress, gown, skirt, bodice, corset, heels) into its masculine equivalent in the SAME motif and colors — e.g. an ornate formal coat/tunic with trousers, an armored doublet, a regal mantle — and NEVER describe a dress, gown, skirt, cleavage, or a feminine silhouette. For a FEMALE character, feminine cuts (dress, gown, skirt) are fine. Keep the item's motif/colors/key features recognizable while changing only the gendered cut.
- Also give the hairstyle (style + color, within the given length). Make the hairstyle suit the stated Gender (masculine for male, feminine for female).
- Keep each item description short (a few words each); merge into ONE flowing clause.
- NEVER mention: the face's features, expression, body shape, proportions, height, the pose, background, camera, art style, or the words "full body".
- Anime/JRPG fantasy aesthetic, opulent and harmonious. Max 65 words. Output ONLY the clause — no preamble, no quotes, no trailing period.`;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface EquipItem {
  slot: 'weapon' | 'armor' | 'accessory';
  /** 표시명(nameKo) — 보조 컨텍스트. */
  name: string;
  /** 영문 외형 키워드(catalog.art). */
  art: string;
  /** 스프라이트 PNG base64 (data prefix 없이 raw). */
  imageB64: string;
}

export interface OutfitClauseInput {
  gender: 'male' | 'female';
  /** 종족 모티프 개념(human은 ''). cat/dragon/fairy 등 — 귀·날개 등 변별로 활용. */
  raceMotif: string;
  /** 머리 길이 영어 묘사. */
  hairLengthDesc: string;
  /** 무기·방어구·장신구 순서 권장. */
  items: EquipItem[];
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } };

const SLOT_LABEL: Record<EquipItem['slot'], string> = {
  weapon: 'WEAPON (wield in hand)',
  armor: 'ARMOR (wear as outfit)',
  accessory: 'ACCESSORY (wear)',
};

/** Haiku vision으로 장비 착용 절 생성. 실패 시 throw — 상위에서 정적 fallback. */
export async function generateOutfitClause(input: OutfitClauseInput): Promise<string> {
  const content: Block[] = [];
  for (const it of input.items) {
    content.push({ type: 'text', text: `${SLOT_LABEL[it.slot]} — "${it.name}" (${it.art}):` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: it.imageB64 },
    });
  }
  content.push({
    type: 'text',
    text: [
      ``,
      `Gender: ${input.gender}`,
      input.raceMotif
        ? `Race flavor (subtly include, e.g. ears/wings/tail): ${input.raceMotif}`
        : `Race: ordinary human`,
      `Hair length (fixed): ${input.hairLengthDesc}`,
      ``,
      `Write the clause: the character wielding the weapon + wearing the armor + wearing the accessory + hairstyle.`,
    ].join('\n'),
  });

  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 300,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });

  const textBlock = res.content.find((b) => b.type === 'text');
  const raw = (textBlock && 'text' in textBlock ? textBlock.text : '').trim();
  if (!raw) throw new Error('OUTFIT_LLM_EMPTY');

  let clause = raw
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
  if (clause.length > MAX_CLAUSE_CHARS) {
    const cut = clause.slice(0, MAX_CLAUSE_CHARS);
    const sp = cut.lastIndexOf(' ');
    clause = (sp > 0 ? cut.slice(0, sp) : cut).trim();
  }
  return clause;
}
