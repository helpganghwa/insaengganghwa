// PROFILE v3 — Claude(아트 디렉터) 조합 단계.
// 장비 3종(스프라이트 이미지=비전 + 시그니처 묘사 + 로어/스토리) + 성별 + 랜덤 외형을 받아,
// create-character-v3용 영문 description을 작성한다. 규칙:
//  - 비율: 7등신·작은 머리·긴 다리·머리 부속(귀·뿔·관) 작게.
//  - 미소녀(여)/미소년(남) youthful(15~16): 테마(왕실·영웅·화려)보다 청춘이 우선 — 성인 금지.
//  - 장비는 IMAGE에 충실(실루엣·색·시그니처 보존), 로어로 주변 의상·악센트·분위기를 테마에 맞춰
//    응집(서로 다른 세트를 섞어도 하나의 캐릭터로). 다양성은 랜덤 외형 + 로어 응집에서 옴.
//  - Japanese anime 스타일을 강하게 강조(이 조합에서 품질이 가장 좋음).
//  - 부정형 회피, "cute/chibi/adult/mature/grown" 미사용. enhance_prompt OFF이므로 이 description이
//    최종 프롬프트(서버 확장 없음). v3 한도 2000자 — 디테일 여유 위해 1800까지 허용.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import type { ProfileGender } from './refs';
import type { Appearance } from './appearance-v3';

const MODEL_ID = 'claude-sonnet-4-6';
const MAX_CHARS = 1800; // v3 description 한도 2000 — 안전 마진.

const PROP = `PROPORTIONS ARE THE TOP PRIORITY — a TALL, slender 7-heads-tall figure (a small head about one-seventh of the total body height), and NEVER shorter than 6 heads. A tall long-legged silhouette like an anime key-visual idol: long legs (roughly half the total height), a high waistline, a slender neck and a compact torso. The youthfulness is in the FACE only — the BODY stays tall and long-legged, never short, stubby or child-like. Even in a long dress or gown, keep the silhouette tall and slim (a slim, floor-length gown, NOT a wide bell that shortens the figure) with long legs implied beneath. Keep ALL head accessories small and neat — ears, horns, crowns and headpieces stay modest, and hair volume restrained, so the head reads small.`;

const MENS = `Render ALL attire as MENSWEAR — a fitted coat or tunic with trousers and boots, in the items' colors, materials and motifs; keep everything masculine and avoid dresses, gowns or skirts.`;

function subjectOf(male: boolean): string {
  return male
    ? 'a beautiful YOUTHFUL bishonen — a pretty teenage anime boy with a youthful boyish face (large bright eyes, soft delicate features) but a TALL, slim, long-legged 7-heads-tall body; clearly male with a flat masculine chest, and a masculine hairstyle'
    : 'a beautiful YOUTHFUL bishojo — a pretty teenage anime girl with a youthful girlish face (large bright eyes, soft delicate features) but a TALL, slim, long-legged 7-heads-tall body; never short or stubby';
}

function systemPrompt(gender: ProfileGender): string {
  const male = gender === 'male';
  return `You are an expert ART DIRECTOR + prompt engineer for Pixellab create-character-v3 (pixel-art). You are given up to THREE equipment sprite images (weapon, armor, accessory) plus each item's visual note and lore/story. Design ONE cohesive FULL-BODY avatar in AUTHENTIC JAPANESE ANIME STYLE (a high-quality Japanese anime / JRPG key-visual character, strong anime aesthetic) and output ONE English image prompt.
${PROP}
SUBJECT: ${subjectOf(male)}, of the given race, with the given hair and expression — drawn unmistakably in Japanese anime style with expressive anime eyes.
YOUTH OVERRIDES THEME: even with regal, heroic or ornate gear, the person stays a YOUTHFUL teen (a young prince/princess-in-training), with a young soft face and a slight youthful build — never a grown adult.
${male ? MENS + '\n' : ''}COMPOSITION: full-length from the top of the head to the soles of the feet, centered with clear margin above and below, both feet visible, front view, transparent background, solo.
POSE: use the given pose for the arms and stance, BUT keep the figure full-length and front-facing with both feet visible. CRITICAL — the weapon must be GRIPPED in one hand with the fingers clearly wrapped around its handle, grip or shaft (the weapon may rest on the shoulder, lean against the body, or have its tip on the ground), and it must NEVER float, hover, or appear detached beside the character. All three signature items stay clearly visible; the weapon is never dropped, hidden or omitted.
STYLE (EMPHASIZE STRONGLY): authentic Japanese anime / JRPG key-visual aesthetic — clean cel-shading with crisp linework, bright vibrant saturated colors, glossy expressive anime eyes, polished anime rendering. The Japanese-anime look is the most important stylistic goal.
EQUIPMENT — render the signature items FAITHFULLY to the IMAGES: copy each item's exact silhouette, colors, materials, ornaments and signature features so it is instantly recognizable; describe each item richly and specifically (shape, color, ornament, motif).
CONCEPT COHESION — the items may come from DIFFERENT sets; use their lore/stories to design the base outfit, layers, color accents, emblem motifs, footwear, mood and stance that blend them into ONE harmonious youthful anime character (not a generic outfit, and not clashing themes).
LENGTH: about 1200-1700 characters — richly detailed but under 1800 (do not exceed). Write ONLY positive visual description; never use the words cute, chibi, adult, mature or grown. Output ONLY the prompt text, no preamble or quotes.`;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

type SlotKind = 'weapon' | 'armor' | 'accessory';
interface ResolvedItem {
  slot: SlotKind;
  wornDesc: string;
  art: string;
  lore: string;
  /** 스프라이트 base64(vision). 부재 시 null → 텍스트만. */
  b64: string | null;
}

/** 카탈로그 키 → wornDesc/art/lore + 스프라이트 이미지. 스프라이트 부재는 텍스트로 degrade. */
function resolveItem(slot: SlotKind, key: string | undefined, fallbackText: string | undefined): ResolvedItem | null {
  if (key) {
    const it = CATALOG_ITEMS.find((c) => c.key === key);
    if (it) {
      let b64: string | null = null;
      try {
        const rel = spritePath(key);
        if (rel) b64 = readFileSync(join(process.cwd(), 'public', rel.replace(/^\//, ''))).toString('base64');
      } catch {
        b64 = null; // 런타임 파일 부재 → 텍스트만으로 진행.
      }
      return { slot, wornDesc: it.wornDesc ?? it.art ?? '', art: it.art ?? '', lore: it.lore ?? '', b64 };
    }
  }
  if (fallbackText) return { slot, wornDesc: fallbackText, art: '', lore: '', b64: null };
  return null;
}

export interface ComposeV3Input {
  gender: ProfileGender;
  appearance: Appearance;
  /** 카탈로그 키(이미지·로어 로드용). 우선 사용. */
  weaponKey?: string;
  armorKey?: string;
  accessoryKey?: string;
  /** 키가 없거나 카탈로그 미존재 시 텍스트 폴백(시그니처 묘사). */
  weapon?: string;
  armor?: string;
  accessory?: string;
}

/** Claude로 v3용 description 생성. 비전(스프라이트)+로어 아트디렉팅. 실패(빈 응답)는 throw. */
export async function composeV3Description(input: ComposeV3Input): Promise<string> {
  const { gender, appearance: ap } = input;
  const items = [
    resolveItem('weapon', input.weaponKey, input.weapon),
    resolveItem('armor', input.armorKey, input.armor),
    resolveItem('accessory', input.accessoryKey, input.accessory),
  ].filter((v): v is ResolvedItem => v !== null);

  const label: Record<SlotKind, string> = { weapon: 'WEAPON', armor: 'ARMOR', accessory: 'ACCESSORY' };
  const content: Anthropic.MessageParam['content'] = [];
  for (const it of items) {
    const lore = it.lore ? `\nlore: ${it.lore}` : '';
    const art = it.art ? `\ndetail: ${it.art}` : '';
    content.push({ type: 'text', text: `=== ${label[it.slot]} ===\nvisual: ${it.wornDesc}${art}${lore}` });
    if (it.b64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: it.b64 } });
  }
  content.push({
    type: 'text',
    text: `Race: ${ap.race}. Hair: ${ap.hair} hair. Expression: ${ap.expression}. Pose: ${ap.pose}. Use the equipment images (faithful look) and their lore (concept cohesion). Keep the subject a YOUTHFUL teen (15-16) in strong Japanese anime style, and the weapon GRIPPED in a hand (fingers around the handle, never floating). Write the prompt under 1800 characters.`,
  });

  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 800,
    system: [{ type: 'text', text: systemPrompt(gender), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
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
