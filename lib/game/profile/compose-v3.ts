// PROFILE v3 — Claude(아트 디렉터) 조합 단계.
// 장비 3종(스프라이트 이미지=비전 + 시그니처 묘사 + 로어/스토리) + 성별 + 랜덤 외형을 받아,
// create-character-v3용 영문 description을 작성한다. 규칙:
//  - 비율: 7등신·작은 머리·긴 다리·머리 부속(귀·뿔·관) 작게.
//  - 미소녀(여)/미소년(남) young adult(20~24, early twenties): 10대 얼굴 방지 + 과성숙 방지.
//  - 무기 = 시그니처: IMAGE에 충실·고디테일 재현(그립·전면 존재감 크게). 쌍수만 양손 강제.
//  - 방어구·장신구 = 충실·인식가능: 실루엣·색·시그니처를 그 아이템으로 알아보게 유지(딴 장비로 대체 X),
//    애니풍 렌더+의상 융화. 손/벨트류 장신구만 배치 다양화(부채=허리 고정 X), 머리착용(투구·관·가면 등)은 머리 고정.
//    → 다양성은 아이템 변형이 아니라 캐릭터(인종·머리·표정·포즈·기본의상·색악센트)에서 낸다.
//  - Japanese anime 스타일을 강하게 강조(이 조합에서 품질이 가장 좋음).
//  - ★프롬프트는 긍정형 서술만★(not/no/never/avoid 등 부정형 지양) — 이미지 생성이 부정 개념을
//    오히려 소환하는 역효과 방지. Claude가 출력하는 프롬프트도 긍정 affirmative 표현으로 유도.
//  - 부정형 회피, "cute/chibi/adult/mature/grown" 미사용. enhance_prompt OFF이므로 이 description이
//    최종 프롬프트(서버 확장 없음). 목표 1800~1950(한계까지 풍부·상세), 압축 트리거 1990, 절단 안전장치 1990.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import type { ProfileGender } from './refs';
import type { Appearance } from './appearance-v3';

const MODEL_ID = 'claude-sonnet-5';
const MAX_CHARS = 1990; // v3 description 한도 2000 직전 — 절단은 최후 안전장치(아래 압축 재생성이 우선).
const SOFT_LIMIT = 1990; // 한계까지 꽉 채워 품질↑ — 목표 1800~1950, 한도(1990) 초과 시에만 압축 재생성.
const COMPOSE_MAX_TOKENS = 1800; // ~1950자(≈500토큰) 출력 + Sonnet 5 사고 토큰 여유(1500에서도 꼬리 절단 관측 — 상향).

const PROP = `PROPORTIONS ARE THE TOP PRIORITY — a TALL, slender figure SEVEN to SEVEN-AND-A-HALF heads tall: a SMALL head that fits about seven times into the total standing height. A dramatically elongated, tall long-legged silhouette like an anime key-visual idol: long legs spanning about HALF the total height (the legs alone as long as three-and-a-half stacked heads), a high waistline, a slender neck and a compact torso. The face is attractive and clearly reads as early-twenties, while the BODY stays tall and long-legged with a slim long-legged build. Even in a long dress or gown, keep the silhouette tall and slim (a slim, floor-length gown that keeps the figure long) with long legs implied beneath. Keep ALL head accessories small and neat — ears, horns, crowns and headpieces stay modest, and hair volume restrained, so the head reads small. Even a large helmet, mask, hood, horned skull, antlers or headdress stays scaled down to sit on a small head; lengthen the body (legs + torso) so the head AND its headgear together stay within about one-sixth of the total height. When in doubt, make the body taller.`;

// 여성형 방어구의 남성 변환 — "코트/튜닉" 2종으로 수렴시키면 교복·갑옷까지 로브화되므로
// (라이브 피드백), 원본 의상 카테고리를 유지한 남성형 대응물로 번역한다.
const MENS = `Render ALL attire as MENSWEAR by translating each garment into the MASCULINE version of the SAME garment type — keep the garment's category and identity: a school or military uniform stays a uniform (a fitted uniform blazer or jacket with matching uniform trousers, keeping its crest, tie and trims), plate armor stays plate armor, a robe stays a robe, a coat stays a coat, and only a dress or gown becomes a princely fitted long coat; any skirt becomes matching trousers. THE TRANSLATION MUST NOT SIMPLIFY: the masculine version carries the SAME ornamentation as the original — transfer the embroidery, brocade, trims, jewels, layered construction and every signature ornament onto the menswear (an ornate gown becomes an EQUALLY ornate princely coat with the same trims and gems, never a plain shirt-and-trousers reduction). Keep each item's signature colors, materials, trims and ornaments, with trousers and boots below. FEMININE MOTIFS — TRANSLATE, NEVER COPY: feminine ornaments are translated into their MASCULINE counterparts in the SAME color, fabric and position — a ribbon or bow becomes a knotted cravat, neck-scarf or pinned sash knot; frills and lace become pleated or embroidered trim; a corset becomes a fitted waistcoat; a flower corsage becomes a medal or brooch pin. The ornament count and richness stay the same — only the SHAPE becomes masculine. EXCEPTION — a SIGNATURE accessory keeps its identity: if a signature item is itself a ribbon-like piece, keep it recognizable as the same item but WEAR it the masculine way (as a cravat knot, medal-pin or sash of the same fabric and color). WRITE THE RESULT ONLY: in your output prompt describe the finished menswear as if it had always been designed for a man — never narrate the translation, never use transformation phrasing ('becomes', 'replaces', 'instead of'), and never let the feminine source words (ribbon, bow, skirt, dress, gown, corsage, frill, lace) appear anywhere in the output — name only the resulting garments (cravat, sash knot, trousers, long coat, waistcoat, pin, pleated trim). An image generator draws every word it reads, so a written-out feminine word gets DRAWN even inside a 'replaced by' sentence.`;

function subjectOf(male: boolean): string {
  return male
    ? 'a good-looking bishonen — a young man in his early twenties (about 20-24), with a fresh youthful adult face that clearly reads as an adult in his early twenties (past the teens, with clean well-defined features), bright expressive eyes and clean handsome features, a TALL slim long-legged 7-heads-tall body; clearly male with a flat masculine chest and a masculine hairstyle'
    : 'a beautiful bishojo — a young woman in her early twenties (about 20-24), with a fresh youthful adult face that clearly reads as an adult in her early twenties (past the teens, poised and clear-featured), bright expressive eyes and clean pretty features, a TALL slim long-legged 7-heads-tall body';
}

function systemPrompt(gender: ProfileGender): string {
  const male = gender === 'male';
  return `You are an expert ART DIRECTOR + prompt engineer for Pixellab create-character-v3 (pixel-art). You are given up to THREE equipment references (weapon, armor, accessory) as sprite images plus each item's visual note and lore. CREATIVELY DESIGN one cohesive FULL-BODY avatar in AUTHENTIC JAPANESE ANIME STYLE (a high-quality Japanese anime / JRPG key-visual character) and output ONE English image prompt. You have real creative latitude — make the most visually appealing anime-JRPG choices and let each design feel fresh, distinct and varied. Spend the words on vivid visual description rather than rigid rules.
${PROP}
SUBJECT: ${subjectOf(male)}, of the given race, with the given hair and expression — drawn unmistakably in Japanese anime style with expressive anime eyes.
AGE — KEEP CONSISTENT: a young adult in their EARLY twenties (about 20-24). Give a fresh, youthful adult face that clearly reads as a person in their early twenties — past the teens, with clean clear features and a bright confident look — and keep this same fresh early-twenties look consistent even with regal, heroic or ornate gear.
${male ? MENS + '\n' : ''}COMPOSITION: full-length from the top of the head to the soles of the feet, centered with clear margin above and below, both feet visible, a clear front view facing the viewer head-on (shoulders, chest and feet square to the camera), transparent background, solo. Always leave clear empty space above the head so the whole figure sits inside the frame.
POSE: use the given pose for the arms and stance, following its mood (usually calm and composed) — natural, relaxed and loose (a gentle weight shift onto one leg is fine), staying FRONT-FACING toward the viewer (both shoulders, chest, feet and face square to the camera). Keep the hands and any weapon at shoulder height or lower, within the frame. HANDS — NAME THEM EXPLICITLY: assign every gesture to a specific hand and say which ('her right hand grips the rapier while her left hand rests on her hip') — never ambiguous references like 'the other hand', 'one hand', or 'her lower hand'. When the pose rests a hand on the hip, state that ONLY that single hand is on the hip and that the opposite hand grips the weapon — the weapon hand always wins over the pose.
WEAPON — FAITHFUL, HIGH DETAIL, PROMINENT: the weapon is the character's SIGNATURE item and deserves the LARGEST SHARE of your description. Reproduce it faithfully and in rich detail from its IMAGE, as if lifting the actual item onto the character — preserve its exact silhouette, main colors, materials and signature ornaments so it reads as the same weapon. Describe it PART BY PART with concrete geometry (blade shape and its length relative to the character's body, guard shape, grip color and wrap, pommel) so the generator reproduces the correct proportions. Render it LARGE and clearly in the FOREGROUND with its shape and details sharp and readable — the single most eye-catching prop. Keep it firmly GRIPPED in a hand and clearly held (fingers around the handle; it may rest on a shoulder, lean on the body or touch the ground). If the weapon is a MATCHED PAIR (twin blades, dual sabers, paired daggers, a set of two), the character wields ONE IN EACH HAND, both fully drawn and held ready — the two are IDENTICAL TWINS: the SAME length, the same blade shape and width, the same guard, grip and level of detail, mirror images of each other (state this explicitly in the prompt). Keep the weapon fully visible and in hand.
ARMOR & ACCESSORY — FAITHFUL & RECOGNIZABLE: render the armor and accessory so they are clearly RECOGNIZABLE as the SAME items shown in their IMAGES — preserve each one's silhouette, main colors and signature ornaments — while drawing them naturally in the anime style and blending them harmoniously onto the character. Keep each source item's identity intact (a faithful anime rendering of the same item). Every accessory is WORN or attached naturally in its PROPER place: a HEAD-WORN piece (helmet, crown, tiara, circlet, mask, hood, headdress, horns, hairpin) always sits ON THE HEAD, and only a hand-or-belt piece (a fan, pouch, charm, sash ornament) VARIES where it sits from one design to the next (held in a free hand, tucked into a belt or waist sash, or fastened as an ornament — mix up the placement of these across designs). A SHIELD is carried on one forearm with its face visible toward the viewer; when the weapon occupies BOTH hands (a matched pair wielded in each hand, or a two-handed grip), the shield is instead slung across the back with part of it showing behind the shoulders.
DIVERSITY — freshness comes from the CHARACTER: vary the race, hair, expression, pose, base-clothing styling, color accents and mood from one design to the next, while keeping the three signature items (weapon, armor, accessory) faithful and consistent to their images. Let the character carry the variety.
CONCEPT COHESION — the items may come from DIFFERENT sets; use their lore to unify the base clothing (non-signature layers), color accents, emblem motifs, footwear, mood and stance into ONE harmonious youthful anime character with a cohesive theme.
STYLE (EMPHASIZE STRONGLY): authentic Japanese anime / JRPG key-visual aesthetic — smooth clean lineless cel-shading with soft shape edges and seamless color fills, bright vibrant saturated colors, glossy expressive anime eyes, polished anime rendering. The Japanese-anime look is the most important stylistic goal.
OUTPUT HYGIENE — THE GENERATOR DRAWS EVERY WORD: the image generator literally draws every noun it reads, so the output prompt contains ONLY what is visible in the final image. Never use meta-language about the design process ('faithfully rendered', 'reimagined', 'inspired by', 'translated', 'reproduced from the reference', 'as shown in the image') — state the appearance itself. Never use transformation or comparison phrasing ('becomes', 'replaces', 'instead of', 'no longer', 'rather than'). Never name any object, garment or feature that must NOT appear in the image — a word written inside a 'replaced by' or 'without' sentence still gets drawn.
LENGTH: aim for about 1800-1950 characters — USE THE ROOM to be richly detailed, vivid and evocative (a flowing description): describe the WEAPON, the recognizable armor and accessory, the base clothing, colors, materials, lighting and mood specifically and generously. BEGIN the prompt with the proportion statement (the TALL slender seven-to-seven-and-a-half-heads-tall long-legged figure) so it leads everything else, then the subject and items. Finish describing ALL THREE items and end on a complete sentence within 1990 characters. Phrase the whole prompt as POSITIVE affirmations — describe what the image contains and how it looks, using affirmative wording throughout. Output ONLY the prompt text itself.`;
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
  lore: string;
  /** 스프라이트 base64(vision). 부재 시 null → 텍스트만. */
  b64: string | null;
}

/**
 * 카탈로그 키 → wornDesc/lore + 스프라이트 이미지. 스프라이트 부재는 텍스트로 degrade.
 * ⚠ art(스프라이트 생성 의도 프롬프트)는 compose 입력에서 제외 — 실제 생성 결과(이미지)와
 *   어긋난 색·서사 표현이 그대로 남아 있어(예: silver guard vs 실제 gold) 이미지 검증된
 *   wornDesc와 모순되는 노이즈가 된다. wornDesc 부재 시 폴백으로만 사용.
 */
function resolveItem(
  slot: SlotKind,
  key: string | undefined,
  fallbackText: string | undefined,
  male: boolean,
): ResolvedItem | null {
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
      // 남성 아바타 + 남성 정본이 있으면 그것을 쓴다(드레스·치마의 번역 부하 제거). 없으면 wornDesc.
      const worn = (male && it.wornDescMale) || it.wornDesc || it.art || '';
      return { slot, wornDesc: worn, lore: it.lore ?? '', b64 };
    }
  }
  if (fallbackText) return { slot, wornDesc: fallbackText, lore: '', b64: null };
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
  const male = gender === 'male';
  const items = [
    resolveItem('weapon', input.weaponKey, input.weapon, male),
    resolveItem('armor', input.armorKey, input.armor, male),
    resolveItem('accessory', input.accessoryKey, input.accessory, male),
  ].filter((v): v is ResolvedItem => v !== null);

  const label: Record<SlotKind, string> = { weapon: 'WEAPON', armor: 'ARMOR', accessory: 'ACCESSORY' };
  const content: Anthropic.MessageParam['content'] = [];
  for (const it of items) {
    const lore = it.lore ? `\nlore: ${it.lore}` : '';
    content.push({ type: 'text', text: `=== ${label[it.slot]} ===\nvisual: ${it.wornDesc}${lore}` });
    if (it.b64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: it.b64 } });
  }
  content.push({
    type: 'text',
    text: `Race: ${ap.race}. Hair: ${ap.hair} hair. Eyes: ${ap.eyeColor} glossy anime eyes — follow this iris color faithfully (it defines this character's identity). Expression: ${ap.expression}. Pose: ${ap.pose}. Reproduce the WEAPON faithfully and in high detail from its image, rendered LARGE and prominent, firmly gripped in a hand and clearly held, described part by part with its proportions relative to the body (if it is a matched pair, one in each hand, both fully drawn and IDENTICAL — same length, same shape, mirror twins). Render the ARMOR and ACCESSORY so they stay clearly RECOGNIZABLE as the SAME items from their images — silhouette, main colors, signature ornaments — anime-styled and blended in, keeping each item's identity; keep a head-worn accessory (helmet, crown, mask, headdress, horns) ON THE HEAD, and vary placement only for hand-or-belt pieces (a fan may sit in a free hand, at the belt or as an ornament); a shield sits on one forearm, or slung across the back when the weapon fills both hands. Draw diversity from the CHARACTER (race, hair, expression, pose, base clothing, color accents, mood) while keeping the items faithful. Keep the subject a good-looking young adult in their early twenties (about 20-24) with a fresh youthful early-twenties face, in strong Japanese anime style. Write the prompt richly detailed toward the ~1900-character budget with all three items fully described, using positive affirmative wording throughout.`,
  });

  const sys = [{ type: 'text' as const, text: systemPrompt(gender), cache_control: { type: 'ephemeral' as const } }];
  const clean = (r: Anthropic.Message): string => {
    const block = r.content.find((b) => b.type === 'text');
    return (block && 'text' in block ? block.text : '')
      .trim()
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: COMPOSE_MAX_TOKENS,
    system: sys,
    messages: [{ role: 'user', content }],
  });
  let desc = clean(res);
  if (!desc) throw new Error('COMPOSE_V3_EMPTY');

  // 한도 초과 시 절단 대신 "압축 재생성"(최대 2회) — 모델이 직접 줄여 문장 완결 보존.
  for (let attempt = 0; attempt < 2 && desc.length > SOFT_LIMIT; attempt++) {
    const r = await client().messages.create({
      model: MODEL_ID,
      max_tokens: COMPOSE_MAX_TOKENS,
      system: sys,
      messages: [
        {
          role: 'user',
          content: `Tighten this Pixellab character prompt to UNDER ${SOFT_LIMIT} characters (it is currently ${desc.length}). KEEP the opening TALL seven-to-seven-and-a-half-heads-tall slender long-legged proportion statement intact at the very start, keep the WEAPON faithful, detailed and prominent, keep the armor and accessory clearly recognizable as the same items, keep the rich evocative flowing Japanese-anime style and the front-facing full-body framing, keep the wording positive and affirmative, and end on a complete sentence. Output ONLY the rewritten prompt:\n\n${desc}`,
        },
      ],
    });
    const shorter = clean(r);
    if (shorter) desc = shorter;
  }

  // 재생성 후에도 절대 한도 초과면 안전 절단(v3 2000 보호) — 단어 경계.
  if (desc.length > MAX_CHARS) {
    const cut = desc.slice(0, MAX_CHARS);
    const sp = cut.lastIndexOf(' ');
    desc = (sp > 0 ? cut.slice(0, sp) : cut).trim();
  }
  return desc;
}
