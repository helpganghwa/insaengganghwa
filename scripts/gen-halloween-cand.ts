// 할로윈 아이템 후보(2026-10-20) — Pixellab **객체**(create-1-direction-object) → public/sprites/halloween-cand/<key>.png
// 실행: bun run scripts/gen-halloween-cand.ts --dry            (프롬프트만 출력, 호출 없음)
//       bun run scripts/gen-halloween-cand.ts                  (누락분만 생성 — 재개형, 유료: 실행 전 사용자 확인)
//       bun run scripts/gen-halloween-cand.ts --only=key1,key2
//       bun run scripts/gen-halloween-cand.ts --concurrency=4     (동시 4개)
//
// 추석 후보(gen-chuseok-cand.ts)와 같은 방식: 객체 · view=sidescroller · 256px(단일 후보) · 키는 key3 고정.
// 객체 id는 obj-map-cand.json에 key3 라벨로 즉시 기록해, 해방 애니(gen-anim3)를 같은 키로 붙인다.
// 1차(10-20): 네 세트(대장장이·유령 신부·프랑켄슈타인·유령 저택 메이드) × 3부위 × 2안 = 24장.
// 꼬리표: 밝은 세트(대장장이)는 items-v2 꼬리표 그대로, 어두운 세트는 'bright and stylish, not gothic'을 뺀 꼬리표(완성 프롬프트).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { scriptKeyFor } from './pixellab-script-key';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const LABEL = 'key3' as const;
const PIX = 'https://api.pixellab.ai/v2';
const SIZE = 256;
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'sprites', 'halloween-cand');
const MAP_PATH = join(ROOT, 'scripts', 'obj-map-cand.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Slot = 'weapon' | 'armor' | 'accessory';
export type HalloweenCand = {
  key: string;
  nameKo: string;
  set: 'smith' | 'bride' | 'frank' | 'maid' | 'smith2' | 'ghost' | 'orc' | 'skeleton' | 'slime' | 'golem' | 'dragon' | 'fallen' | 'smith3' | 'butler' | 'smith4' | 'vampire' | 'smith5' | 'vampire2' | 'smith6' | 'household' | 'smith7' | 'vampire3' | 'candy' | 'smith8' | 'cat' | 'final9';
  slot: Slot;
  /** 밝은 세트는 items-v2 꼬리표(not gothic), 어두운 세트는 할로윈 꼬리표. */
  tone: 'bright' | 'dark' | 'costume';
  concept: string;
  art: string;
  batch: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** 꼬리표만 다른 부위 것을 쓴다 — 4차 앞치마처럼 방어구를 몸 없이 물건 하나로 그릴 때(accessory 꼬리표). */
  tailAs?: Slot;
};

const TAIL_BRIGHT: Record<Slot, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game weapon, bright and stylish, not gothic, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game outfit, bright and stylish, not gothic, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game item, bright and stylish, not gothic, a single isolated object on a plain flat empty background, pixel art',
};
const TAIL_DARK: Record<Slot, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game weapon, elegant and stylish, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game outfit, elegant and stylish, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game item, elegant and stylish, a single isolated object on a plain flat empty background, pixel art',
};

// 2차 분장 세트 — 할로윈 축제 분장 옷 느낌(귀엽고 장난스럽게), 고딕 금지 꼬리표는 뺀다.
const TAIL_COSTUME: Record<Slot, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game Halloween costume weapon, cute and festive, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game Halloween costume outfit, cute and festive, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game Halloween costume item, cute and festive, a single isolated object on a plain flat empty background, pixel art',
};

export const SET_NAME: Record<HalloweenCand['set'], string> = {
  smith: '대장장이',
  bride: '유령 신부',
  frank: '프랑켄슈타인',
  maid: '유령 저택 메이드',
  smith2: '대장장이(2차)',
  ghost: '유령 분장',
  orc: '오크 분장',
  skeleton: '해골 분장',
  slime: '슬라임 분장',
  golem: '골렘 분장',
  dragon: '꼬마 용 분장',
  fallen: '타락천사 분장',
  smith3: '대장장이(3차 · 호박 대장간)',
  butler: '유령 저택 집사',
  smith4: '대장장이(4차 · 명장의 대장간)',
  vampire: '뱀파이어 백작',
  smith5: '대장장이(5차 · 명장, 특색·디테일)',
  vampire2: '꼬마 뱀파이어 분장',
  smith6: '대장장이 장신구(6차 · 고글 대체)',
  household: '유령 저택 하인(메이드·집사 통합)',
  smith7: '대장장이(7차 · 5차 앞치마 확정, 무기·장신구 다시)',
  vampire3: '꼬마 뱀파이어 분장(7차 · 다른 종류)',
  candy: '사탕 세트(7차)',
  smith8: '대장장이 망치(8차 · 여러 컨셉)',
  cat: '검은 고양이 분장(8차 · 남녀 공용)',
  final9: '확정 세트 다듬기(9차 · 두건 장식 없이, 양산 리본 없이)',
};

export const CANDIDATES: HalloweenCand[] = [
  // ══ 대장장이 ══════════════════════════════════════════════════════════════
  {
    key: 'hw_smith_tongs_a', nameKo: '달군 쇠 집게(쇳덩이)', set: 'smith', slot: 'weapon', tone: 'bright', batch: 1,
    concept: '긴 집게가 벌겋게 달군 쇳덩이를 물고 있음, 불똥',
    art:
      'a pair of long blacksmith tongs of dark forged iron, the jaws gripping a glowing orange-hot iron bar with bright sparks flying from its tip, ' +
      'a riveted pivot, handles wrapped in worn brown leather, sturdy and fiery, clearly a tongs weapon, no text, large, diagonal',
  },
  {
    key: 'hw_smith_tongs_b', nameKo: '달군 쇠 집게(편자)', set: 'smith', slot: 'weapon', tone: 'bright', batch: 1,
    concept: '집게가 달군 편자를 물고 있음, 놋쇠 리벳',
    art:
      'long heavy iron smithing tongs with a glowing red-hot horseshoe clamped in the jaws, ember sparks scattering, dark steel with brass rivets, ' +
      'handles bound in dark leather cord, rugged and fiery, clearly a tongs weapon, no text, large, diagonal',
  },
  {
    key: 'hw_smith_apron_a', nameKo: '그을린 가죽 앞치마(갈색)', set: 'smith', slot: 'armor', tone: 'bright', batch: 1,
    concept: '두꺼운 갈색 가죽 앞치마, 소매 걷은 셔츠',
    art:
      'a blacksmith outfit: a thick dark brown leather apron with scorch marks and small ember burns, worn over a cream linen shirt with the sleeves rolled to the elbow, ' +
      'a wide belt with a brass buckle, dark trousers and heavy boots, sturdy and warm',
  },
  {
    key: 'hw_smith_apron_b', nameKo: '그을린 가죽 앞치마(잿빛)', set: 'smith', slot: 'armor', tone: 'bright', batch: 1,
    concept: '잿빛 가죽 앞치마에 놋쇠 리벳, 붉은 셔츠',
    art:
      'a smith work outfit: a heavy charcoal-gray leather apron with brass rivets and a scorched hem, over a rust-red shirt with rolled sleeves, ' +
      'thick leather gloves tucked in the belt, dark work trousers and boots, rugged and dependable',
  },
  {
    key: 'hw_smith_belt_a', nameKo: '연장 벨트(망치·줄·정)', set: 'smith', slot: 'accessory', tone: 'bright', batch: 1,
    concept: '가죽 벨트에 작은 망치·줄·정',
    art:
      'a blacksmith tool belt: a wide dark leather belt with a heavy brass buckle, a small iron hammer, a rasp file and a chisel hanging from leather loops, ' +
      'a small leather pouch at the side, rugged and practical',
  },
  {
    key: 'hw_smith_belt_b', nameKo: '연장 벨트(고리식)', set: 'smith', slot: 'accessory', tone: 'bright', batch: 1,
    concept: '놋쇠 고리에 망치·집게·펀치, 철사 뭉치',
    art:
      'a leather smith belt with a square iron buckle, a hammer, small tongs and a punch hanging from brass rings, a coil of wire and a small pouch of nails, ' +
      'worn and sturdy',
  },
  // ══ 유령 신부 ═════════════════════════════════════════════════════════════
  {
    key: 'hw_bride_candelabra_a', nameKo: '꺼지지 않는 촛대(세 갈래)', set: 'bride', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '세 갈래 은촛대, 푸른 촛불, 흐르는 촛농',
    art:
      'a tall three-branched tarnished silver candelabra with three pale candles burning with ghostly blue flames, wax dripping down the arms, ' +
      'an ornate twisted stem and a heavy filigree base, haunting and elegant, clearly a candelabra weapon, no text, large, diagonal',
  },
  {
    key: 'hw_bride_candelabra_b', nameKo: '꺼지지 않는 촛대(덩굴 팔)', set: 'bride', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '덩굴처럼 감긴 팔, 거미줄, 푸른 불꽃',
    art:
      'an ornate silver candelabra with three arms curling like vines, three white candles with flickering pale blue flames, thin cobweb strands between the arms, ' +
      'a long slender stem ending in a spiked base, ghostly and elegant, clearly a candelabra mace weapon, no text, large, diagonal',
  },
  {
    key: 'hw_bride_dress_a', nameKo: '빛바랜 웨딩드레스(새틴)', set: 'bride', slot: 'armor', tone: 'dark', batch: 1,
    concept: '푸르스름한 흰 새틴, 찢긴 밑단, 레이스 소매',
    art:
      'a faded ghost bride wedding dress: pale bluish-white satin with a torn tattered hem, long sheer lace sleeves, a satin ribbon at the waist, ' +
      'a faint blue glow along the edges, haunting and elegant',
  },
  {
    key: 'hw_bride_dress_b', nameKo: '빛바랜 웨딩드레스(튤)', set: 'bride', slot: 'armor', tone: 'dark', batch: 1,
    concept: '은실 자수 보디스, 겹겹 튤 치마가 길게 끌림',
    art:
      'an old wedding gown in ghostly white with a pale blue tint, a fitted bodice with silver thread embroidery, a long ragged trailing skirt of layered tulle, ' +
      'thin silver lace at the neckline, delicate and eerie',
  },
  {
    key: 'hw_bride_veil_a', nameKo: '검은 면사포(장미 티아라)', set: 'bride', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '뒤로 넘긴 검은 레이스 면사포, 검은 장미 은 티아라',
    art:
      'a black lace bridal veil swept back behind the head, held by a small silver tiara of dark roses, long sheer black tulle flowing down the back, ' +
      'mournful and elegant',
  },
  {
    key: 'hw_bride_veil_b', nameKo: '검은 면사포(시든 장미 화관)', set: 'bride', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '시든 흰 장미 화관에 달린 긴 검은 면사포',
    art:
      'a long black wedding veil thrown back behind the head, attached to a wreath of withered white roses and silver leaves, translucent black mesh with lace edging, ' +
      'haunting and graceful',
  },
  // ══ 프랑켄슈타인 ══════════════════════════════════════════════════════════
  {
    key: 'hw_frank_wrench_a', nameKo: '볼트 조이는 거대 스패너(구리)', set: 'frank', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '구리색 거대 스패너, 턱에 전기 불꽃',
    art:
      'a giant heavy copper wrench with a wide open jaw, crackling blue-white electric sparks arcing across the jaw, a thick riveted handle with a dark rubber grip, ' +
      'powerful and electric, clearly a wrench weapon, no text, large, diagonal',
  },
  {
    key: 'hw_frank_wrench_b', nameKo: '볼트 조이는 거대 스패너(코일)', set: 'frank', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '낡은 구리·놋쇠, 초록 코일, 전기 아크',
    art:
      'an oversized spanner wrench of weathered copper and brass, a glowing green lightning coil wrapped around the handle and bright electric arcs at the jaw, ' +
      'bold and electric, clearly a wrench club weapon, no text, large, diagonal',
  },
  {
    key: 'hw_frank_jacket_a', nameKo: '꿰맨 자국 재킷(초록·갈색)', set: 'frank', slot: 'armor', tone: 'dark', batch: 1,
    concept: '짧은 소매, 굵은 검은 십자 실밥, 기운 천',
    art:
      'a patchwork monster jacket: a dark green and brown short-sleeved jacket stitched together from mismatched cloth with thick black cross stitches, ' +
      'a ragged collar, dark trousers with torn cuffs, scrappy and bold',
  },
  {
    key: 'hw_frank_jacket_b', nameKo: '꿰맨 자국 재킷(올리브·회색)', set: 'frank', slot: 'armor', tone: 'dark', batch: 1,
    concept: '올리브·회색 기운 천, 거친 검은 실, 큰 단추',
    art:
      'a stitched-up jacket in faded olive and gray patches sewn with coarse black thread, short frayed sleeves, large mismatched buttons, ' +
      'dark trousers with patched knees, rough and striking',
  },
  {
    key: 'hw_frank_choker_a', nameKo: '목 볼트 초커(가죽)', set: 'frank', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '검은 가죽 초커, 양쪽 쇠 볼트, 불꽃',
    art:
      'a monster neck bolt choker: a dark leather collar with a large iron bolt on each side, small electric sparks between the bolts, riveted edges, ' +
      'bold and electric',
  },
  {
    key: 'hw_frank_choker_b', nameKo: '목 볼트 초커(금속)', set: 'frank', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '금속 초커, 놋쇠 볼트, 초록 보석',
    art:
      'a thick metal choker collar with two protruding brass bolts and a glowing green gem in the center, small lightning sparks jumping between the bolts, ' +
      'industrial and striking',
  },
  // ══ 유령 저택 메이드 ══════════════════════════════════════════════════════
  {
    key: 'hw_maid_duster_a', nameKo: '깃털 먼지떨이(검은 깃털)', set: 'maid', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '윤기 나는 검은 깃털, 은 손잡이, 검은 리본',
    art:
      'a long feather duster with a full plume of glossy black feathers and a slim polished silver handle, a thin black ribbon tied at the neck, ' +
      'elegant and playful, clearly a feather duster weapon, no text, large, diagonal',
  },
  {
    key: 'hw_maid_duster_b', nameKo: '깃털 먼지떨이(유령불)', set: 'maid', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '검은·보라 깃털 끝에 푸른 빛, 은 손잡이',
    art:
      'a feather duster with a wide fan of black and dark purple feathers glowing pale blue at the tips, an ornate silver handle with a small ring at the end, ' +
      'elegant and eerie, clearly a feather duster weapon, no text, large, diagonal',
  },
  {
    key: 'hw_maid_dress_a', nameKo: '메이드 드레스(긴 소매)', set: 'maid', slot: 'armor', tone: 'dark', batch: 1,
    concept: '검은 긴 소매 드레스, 흰 프릴 앞치마, 흰 레이스 커프스',
    art:
      'a haunted manor maid dress: a black long-sleeved dress with a frilly white apron, white lace cuffs and collar, a black ribbon bow at the chest, ' +
      'white stockings and black shoes, neat and elegant',
  },
  {
    key: 'hw_maid_dress_b', nameKo: '메이드 드레스(퍼프 소매)', set: 'maid', slot: 'armor', tone: 'dark', batch: 1,
    concept: '퍼프 짧은 소매, 흰 러플 앞치마, 보라 리본, 긴 흰 장갑',
    art:
      'a gothic maid uniform: a black dress with puffed short sleeves, a white ruffled apron with lace trim, a dark purple ribbon at the collar, ' +
      'long white gloves and black stockings, prim and elegant',
  },
  {
    key: 'hw_maid_cap_a', nameKo: '레이스 머리 장식(리본)', set: 'maid', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '흰 레이스 캡 밴드, 작은 검은 리본',
    art:
      'a white lace maid headdress: a frilled white lace cap band with a small black ribbon bow, delicate and neat',
  },
  {
    key: 'hw_maid_cap_b', nameKo: '레이스 머리 장식(거미 장식)', set: 'maid', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '흰 러플 레이스 머리띠, 검은 리본 두 가닥, 작은 은 거미',
    art:
      'a white ruffled lace maid headband with two trailing black ribbons and a tiny silver spider charm, dainty and eerie',
  },
  // ══ 2차(10-23): 대장장이(유머) · 유령 분장 · 오크 분장 · 해골 분장 — 세트마다 1안씩 12장 ══
  {
    key: 'hw2_smith_hammer', nameKo: '말하는 담금망치', set: 'smith2', slot: 'weapon', tone: 'bright', batch: 2,
    concept: '망치 머리에 투덜대는 얼굴(부릅뜬 눈·팔자 콧수염·벌린 입), 머리 끝이 달아올라 있음',
    art:
      'a sturdy blacksmith forging hammer whose dark iron head has a grumpy cartoon face: big glaring eyes, bushy eyebrows, a thick curled mustache and an open shouting mouth, ' +
      'one end of the head glowing orange-hot with tiny sparks, a worn wooden handle wrapped in leather, funny and charming, clearly a hammer weapon, no text, large, diagonal',
  },
  {
    key: 'hw2_smith_apron', nameKo: '손때 묻은 가죽 앞치마', set: 'smith2', slot: 'armor', tone: 'bright', batch: 2,
    concept: '평범한 갈색 가죽 앞치마, 소매 걷은 셔츠',
    art:
      'a plain blacksmith work outfit: a simple brown leather apron over a cream linen shirt with the sleeves rolled up, ' +
      'a plain leather belt, dark trousers and sturdy boots, simple and tidy',
  },
  {
    key: 'hw2_smith_scarf', nameKo: '불똥 막이 두건', set: 'smith2', slot: 'accessory', tone: 'bright', batch: 2,
    concept: '뒤로 묶은 천 두건, 기운 자국',
    art:
      'a blacksmith cloth headscarf: a rust-red cotton bandana tied at the back with two short trailing ends, a small sewn patch on the side, simple and neat',
  },
  {
    key: 'hw2_ghost_basket', nameKo: '사탕 가득 호박 바구니', set: 'ghost', slot: 'weapon', tone: 'costume', batch: 2,
    concept: '호박 얼굴 바구니에 포장 사탕이 넘침, 긴 손잡이',
    art:
      'a trick-or-treat jack-o-lantern bucket with a cute carved smiling face, overflowing with colorful wrapped candies and lollipops, hanging from a long curved handle, ' +
      'cute and festive, clearly a weapon held by the handle, no text, large, diagonal',
  },
  {
    key: 'hw2_ghost_sheet', nameKo: '바닥에 끌리는 홑청 망토', set: 'ghost', slot: 'armor', tone: 'costume', batch: 2,
    concept: '흰 천을 뒤집어쓴 유령 분장, 물결치는 밑단, 주황 리본 사탕 주머니',
    art:
      'a ghost costume: a long flowing white sheet robe with a wavy ragged hem trailing on the ground, loose wide sleeves, ' +
      'a small orange ribbon bow and a little candy pouch at the waist, soft and cute',
  },
  {
    key: 'hw2_ghost_mask', nameKo: '눈구멍 뚫린 유령 가면', set: 'ghost', slot: 'accessory', tone: 'costume', batch: 2,
    concept: '둥근 눈구멍 두 개를 뚫은 흰 천 두건 가면',
    art:
      'a white cloth ghost hood mask with two round black eye holes and a small round mouth hole, soft fabric folds, a tiny orange bow on top, cute and spooky',
  },
  {
    key: 'hw2_orc_club', nameKo: '호박 매단 가시 몽둥이', set: 'orc', slot: 'weapon', tone: 'costume', batch: 2,
    concept: '쇠 가시 박힌 커다란 나무 몽둥이, 끈으로 묶은 작은 호박등',
    art:
      'a huge crude wooden club studded with iron spikes, a small carved jack-o-lantern tied to it with rope, orange and purple cloth strips wrapped around the grip, ' +
      'bold and playful, clearly a club weapon, no text, large, diagonal',
  },
  {
    key: 'hw2_orc_vest', nameKo: '누덕누덕 털가죽 조끼', set: 'orc', slot: 'armor', tone: 'costume', batch: 2,
    concept: '털 달린 가죽 조끼, 한쪽 어깨 가죽 갑판, 주황·보라 줄무늬 바지',
    art:
      'an orc costume: a shaggy fur-trimmed patchwork leather vest, a single crude leather shoulder plate with bone studs, a rope belt with a big tusk buckle, ' +
      'orange and purple striped baggy trousers and fur boots, rugged and playful',
  },
  {
    key: 'hw2_orc_mask', nameKo: '엄니 달린 오크 가면', set: 'orc', slot: 'accessory', tone: 'costume', batch: 2,
    concept: '초록 오크 반가면, 큰 아래 엄니, 뾰족 귀',
    art:
      'a green orc half-mask with two big upward tusks, a heavy brow, and long pointed green ears on a headband, painted orange tribal stripes, bold and funny',
  },
  {
    key: 'hw2_skel_bone', nameKo: '리본 묶은 뼈다귀 곤봉', set: 'skeleton', slot: 'weapon', tone: 'costume', batch: 2,
    concept: '커다란 흰 뼈다귀, 손잡이에 보라 리본',
    art:
      'a giant white bone club shaped like a big cartoon femur, a purple ribbon bow tied around the grip, small orange candy charms hanging from the bow, ' +
      'playful and spooky, clearly a club weapon, no text, large, diagonal',
  },
  {
    key: 'hw2_skel_suit', nameKo: '뼈 무늬 쫄쫄이 옷', set: 'skeleton', slot: 'armor', tone: 'costume', batch: 2,
    concept: '검은 전신 옷에 흰 갈비뼈·팔다리뼈 무늬, 짧은 보라 망토',
    art:
      'a skeleton costume: a black full-body suit printed with white ribs, spine and arm and leg bones, a short purple cape over the shoulders, ' +
      'black gloves with white finger bones, playful and spooky',
  },
  {
    key: 'hw2_skel_mask', nameKo: '꽃 얹은 해골 반가면', set: 'skeleton', slot: 'accessory', tone: 'costume', batch: 2,
    concept: '하얀 해골 반가면, 이마에 주황 꽃 한 송이',
    art:
      'a white skull half-mask with big round black eye sockets and a little stitched grin, a single orange flower tucked at the brow, cute and spooky',
  },
  // ══ 3차(10-25): 세계관 분장 4세트(슬라임·골렘·꼬마 용·타락천사) + 대장장이 새 스타일(호박 대장간) + 메이드의 남성판(유령 저택 집사) — 세트마다 1안씩 18장 ══
  {
    key: 'hw3_slime_wand', nameKo: '말랑 슬라임 막대사탕', set: 'slime', slot: 'weapon', tone: 'costume', batch: 3,
    concept: '막대 끝에 초록 젤리 슬라임이 붙은 막대사탕 지팡이',
    art:
      'a long candy-striped lollipop staff topped with a round glossy green jelly slime with a cute smiling face, the slime drooping slightly over a swirled orange and purple lollipop, ' +
      'small slime droplets, cute and festive, clearly a staff weapon, no text, large, diagonal',
  },
  {
    key: 'hw3_slime_poncho', nameKo: '줄줄 흐르는 점액 판초', set: 'slime', slot: 'armor', tone: 'costume', batch: 3,
    concept: '초록 점액이 흘러내리는 판초, 밑단에 사탕 포장지',
    art:
      'a slime costume: a glossy translucent green jelly poncho dripping down in soft rounded drips, colorful wrapped candies stuck along the hem, ' +
      'over an orange shirt, purple shorts and green boots, cute and bouncy',
  },
  {
    key: 'hw3_slime_crown', nameKo: '왕관 쓴 슬라임 머리띠', set: 'slime', slot: 'accessory', tone: 'costume', batch: 3,
    concept: '머리 위에 얹는 작은 슬라임, 슬라임이 금관을 쓴 모양',
    art:
      'a headband with a small round glossy green jelly slime on top wearing a tiny tilted golden crown, the slime with a cute sleepy face, ' +
      'cute and funny',
  },
  {
    key: 'hw3_golem_fist', nameKo: '균열 새는 돌주먹', set: 'golem', slot: 'weapon', tone: 'costume', batch: 3,
    concept: '푸른 균열이 새는 커다란 돌주먹 장갑',
    art:
      'a huge stone gauntlet fist made of chunky grey carved stone blocks, glowing cyan-blue light leaking from the cracks between the stones, ' +
      'a small carved pumpkin face on the back of the hand, sturdy and playful, clearly a gauntlet weapon, no text, large, diagonal',
  },
  {
    key: 'hw3_golem_armor', nameKo: '돌무더기 상자 갑옷', set: 'golem', slot: 'armor', tone: 'costume', batch: 3,
    concept: '돌 조각을 이어 붙인 네모난 갑옷, 틈마다 푸른빛',
    art:
      'a golem costume: a boxy armor made of square grey stone slabs fitted together, soft cyan-blue light glowing in every seam, ' +
      'chunky stone shoulder blocks, stone-block boots, an orange sash at the waist, sturdy and cute',
  },
  {
    key: 'hw3_golem_helm', nameKo: '눈빛 새는 돌 투구', set: 'golem', slot: 'accessory', tone: 'costume', batch: 3,
    concept: '잭오랜턴처럼 눈과 입을 파낸 돌 투구, 안에서 푸른 불빛',
    art:
      'a round grey stone helmet carved like a jack-o-lantern with triangle eyes and a jagged grin, cyan-blue light glowing from inside the carved holes, ' +
      'a little moss on top, playful and spooky',
  },
  {
    key: 'hw3_dragon_staff', nameKo: '불씨 뱉는 용머리 지팡이', set: 'dragon', slot: 'weapon', tone: 'costume', batch: 3,
    concept: '입에서 작은 불꽃이 나오는 용머리 지팡이',
    art:
      'a wooden staff topped with a cute carved baby dragon head with big round eyes, a small orange flame puffing from its open mouth, ' +
      'a red scarf tied below the head, cute and festive, clearly a staff weapon, no text, large, diagonal',
  },
  {
    key: 'hw3_dragon_cloak', nameKo: '꼬리 달린 비늘 후드 망토', set: 'dragon', slot: 'armor', tone: 'costume', batch: 3,
    concept: '잿빛 비늘 무늬 후드 망토, 등에 천 날개, 엉덩이에 꼬리',
    art:
      'a baby dragon costume: an ash-grey cloak printed with scale patterns, small stitched fabric wings on the back, a plush dragon tail at the back, ' +
      'over a warm orange tunic and dark boots, cute and cozy',
  },
  {
    key: 'hw3_dragon_horns', nameKo: '동글 뿔 비늘 귀 머리띠', set: 'dragon', slot: 'accessory', tone: 'costume', batch: 3,
    concept: '둥글고 짧은 용 뿔과 비늘 귀가 달린 머리띠',
    art:
      'a headband with two short round stubby dragon horns and two small finned scale ears, ash-grey and orange, soft plush look, cute and festive',
  },
  {
    key: 'hw3_fallen_staff', nameKo: '깨진 후광 깃털 지팡이', set: 'fallen', slot: 'weapon', tone: 'costume', batch: 3,
    concept: '부러진 후광을 엮은 검은 깃털 지팡이',
    art:
      'a slender staff of black feathers bound together, topped with a broken golden halo ring tied on with ribbon, a few loose black feathers drifting, ' +
      'elegant and eerie, clearly a staff weapon, no text, large, diagonal',
  },
  {
    key: 'hw3_fallen_robe', nameKo: '검은 깃털 숄 흰 로브', set: 'fallen', slot: 'armor', tone: 'costume', batch: 3,
    concept: '검은 깃털 숄을 두른 해진 흰 로브',
    art:
      'a fallen angel costume: a long white robe with softly frayed hem and sleeves, a fluffy black feather shawl over the shoulders, ' +
      'a thin gold cord belt, elegant and eerie',
  },
  {
    key: 'hw3_fallen_halo', nameKo: '금 간 후광 머리띠', set: 'fallen', slot: 'accessory', tone: 'costume', batch: 3,
    concept: '철사로 세운 금이 간 후광 머리띠',
    art:
      'a headband with a cracked golden halo held up on a thin wire above it, the halo slightly tilted with a chipped gap, a small black feather at the side, ' +
      'elegant and eerie',
  },
  {
    key: 'hw3_smith_pumpkin', nameKo: '호박등 단조망치', set: 'smith3', slot: 'weapon', tone: 'costume', batch: 3,
    concept: '망치 머리가 속을 파낸 호박, 안에서 대장간 불빛이 이글거림',
    art:
      'a blacksmith forging hammer whose head is a carved jack-o-lantern banded with riveted black iron straps, glowing orange forge fire inside the carved eyes and grin, ' +
      'a dark wooden handle, embers drifting, festive and fiery, clearly a hammer weapon, no text, large, diagonal',
  },
  {
    key: 'hw3_smith_coat', nameKo: '불티 수놓은 대장간 작업복', set: 'smith3', slot: 'armor', tone: 'costume', batch: 3,
    concept: '그을린 검정 작업복, 주황 불티 자수, 보라 앞치마',
    art:
      'a festive blacksmith outfit: a soot-black work coat with orange ember embroidery, a deep purple leather apron with pumpkin-shaped brass rivets, ' +
      'rolled sleeves, thick gloves tucked in the belt, sturdy boots, warm and festive',
  },
  {
    key: 'hw3_smith_goggles', nameKo: '호박빛 용접 고글', set: 'smith3', slot: 'accessory', tone: 'costume', batch: 3,
    concept: '둥근 주황 렌즈 고글, 렌즈에 호박 얼굴 무늬',
    art:
      'a pair of round brass blacksmith goggles on a leather strap, glowing orange lenses with a faint jack-o-lantern face pattern, small rivets, ' +
      'festive and charming',
  },
  {
    key: 'hw3_butler_cane', nameKo: '유령불 집사 지팡이', set: 'butler', slot: 'weapon', tone: 'dark', batch: 3,
    concept: '검은 지팡이 끝에 작은 은 랜턴, 안에 푸른 유령불',
    art:
      'an elegant black butler cane with a polished silver handle, a tiny ornate silver lantern hanging from the top holding a pale blue ghost flame, ' +
      'refined and eerie, clearly a cane weapon, no text, large, diagonal',
  },
  {
    key: 'hw3_butler_suit', nameKo: '거미줄 레이스 연미복', set: 'butler', slot: 'armor', tone: 'dark', batch: 3,
    concept: '검은 연미복, 회색 조끼, 거미줄 레이스 크라바트, 흰 장갑',
    art:
      "a haunted mansion butler outfit: a black tailcoat with long tails, a charcoal waistcoat with silver buttons, a white cobweb-lace cravat, " +
      'white gloves, sharp black trousers and polished shoes, refined and eerie, a man\'s outfit',
  },
  {
    key: 'hw3_butler_tie', nameKo: '박쥐 날개 나비넥타이', set: 'butler', slot: 'accessory', tone: 'dark', batch: 3,
    concept: '박쥐 날개 모양 검은 나비넥타이, 가운데 은 브로치',
    art:
      'a black satin bow tie shaped like a pair of small bat wings, a round silver brooch with a tiny pale blue gem in the center, refined and charming',
  },
  // ══ 4차(10-26): 대장장이 정통(명장의 대장간, 할로윈 컨셉 제외) + 뱀파이어 백작 — 세트마다 1안씩 6장 ══
  // 앞치마는 그림에 앞치마만(몸·셔츠 없이) 그리고, 리넨 셔츠는 착용 묘사·로어에서 더한다(10-26 사용자 지시).
  {
    key: 'hw4_smith_hammer', nameKo: '명장의 단조 망치', set: 'smith4', slot: 'weapon', tone: 'bright', batch: 4,
    concept: '손때 묻은 단조 망치, 자루에 가죽 감기와 놋쇠 띠, 전투 망치보다 작고 단정',
    art:
      "a master blacksmith's forging hammer: a compact well-worn dark steel head with one flat face and one rounded peen, a polished ash-wood handle wrapped in brown leather " +
      'with two thin brass bands, finely crafted and dignified, clearly a hammer weapon, no text, large, diagonal',
  },
  {
    key: 'hw4_smith_apron', nameKo: '명장의 가죽 앞치마', set: 'smith4', slot: 'armor', tone: 'bright', batch: 4, tailAs: 'accessory',
    concept: '두꺼운 가죽 앞치마만(몸 없이). 리넨 셔츠는 착용 묘사에서 더한다',
    art:
      "a thick brown leather master blacksmith's apron laid out flat on its own, from chest to knees, neat stitched edges, brass buckles on the neck strap and waist ties, " +
      'two tool pockets on the front holding a small chisel and a file, a few dark scorch marks, finely crafted and dignified',
  },
  {
    key: 'hw4_smith_goggles', nameKo: '호박빛 놋쇠 보안경', set: 'smith4', slot: 'accessory', tone: 'bright', batch: 4,
    concept: '이마에 올려 쓰는 놋쇠 보안경, 짙은 호박색 렌즈',
    art:
      "a pair of round brass blacksmith goggles on a thick leather strap, deep amber-tinted lenses, small rivets and side vents on the brass rims, finely crafted and dignified",
  },
  {
    key: 'hw4_vamp_cane', nameKo: '박쥐 은장 지팡이', set: 'vampire', slot: 'weapon', tone: 'dark', batch: 4,
    concept: '검은 지팡이, 손잡이에 날개 편 은 박쥐 장식, 붉은 보석',
    art:
      "a vampire count's elegant walking cane of glossy black wood, the silver handle shaped like a bat with spread wings holding a deep red ruby, " +
      'a silver tip, refined and aristocratic, clearly a cane weapon, no text, large, diagonal',
  },
  {
    key: 'hw4_vamp_coat', nameKo: '진홍 안감 백작 연미복', set: 'vampire', slot: 'armor', tone: 'dark', batch: 4,
    concept: '진홍 안감의 검은 망토와 연미복, 높은 깃',
    art:
      "a vampire count's outfit: a black tailcoat with a deep crimson silk lining, a long black cape with a tall stand-up collar lined in crimson, " +
      'a black brocade waistcoat with silver buttons, a white ruffled cravat, sharp black trousers and polished boots, refined and aristocratic',
  },
  {
    key: 'hw4_vamp_brooch', nameKo: '핏빛 루비 깃 장식', set: 'vampire', slot: 'accessory', tone: 'dark', batch: 4,
    concept: '높은 깃에 다는 루비 브로치, 은 세공',
    art:
      'an ornate silver collar brooch set with a large deep red ruby, delicate filigree bat-wing scrolls on both sides, a short silver chain hanging below, refined and aristocratic',
  },
  // ══ 5차(10-26): 4차 피드백 — 대장장이 무기·장신구는 더 특색 있게, 앞치마는 더 디테일하게 / 뱀파이어는 귀여운 할로윈 코스튬으로 ══
  {
    key: 'hw5_smith_hammer', nameKo: '인장 새긴 명장 망치', set: 'smith5', slot: 'weapon', tone: 'bright', batch: 5,
    concept: '머리 옆면에 망치와 모루 인장, 한쪽 면이 달궈져 빛남, 자루에 놋쇠 명장 패',
    art:
      "a master blacksmith's forging hammer with a broad dark steel head engraved on its side with a hammer-and-anvil seal, one striking face still glowing orange from the forge, " +
      'a long ash-wood handle wrapped in braided leather, a small brass master tag hanging from a cord at the end, distinctive and finely crafted, clearly a hammer weapon, no text, large, diagonal',
  },
  {
    key: 'hw5_smith_apron', nameKo: '장인의 앞치마', set: 'smith5', slot: 'armor', tone: 'bright', batch: 5, tailAs: 'accessory',
    concept: '앞치마만(몸 없이). 덧댄 가죽, 박음질 무늬, 망치·모루 문양, 연장 주머니 여럿, 놋쇠 리벳',
    art:
      "a richly detailed brown leather master blacksmith's apron on its own, from chest to knees, layered patched leather panels with decorative stitching and brass rivets, " +
      'an embossed hammer-and-anvil emblem on the chest, several front pockets holding small tongs, a chisel, a file and a folding ruler, crossed leather straps with brass buckles, ' +
      'darkened scorch marks along the hem, finely crafted',
  },
  {
    key: 'hw5_smith_goggles', nameKo: '겹렌즈 장인 보안경', set: 'smith5', slot: 'accessory', tone: 'bright', batch: 5,
    concept: '놋쇠 보안경에 접었다 펴는 확대 렌즈가 여러 겹, 호박색 렌즈',
    art:
      'a pair of round brass master craftsman goggles on a leather strap, deep amber lenses with extra small magnifying lenses on swing-down brass arms stacked over one eye, ' +
      'tiny gears and rivets on the rims, distinctive and finely crafted',
  },
  {
    key: 'hw5_vamp_wand', nameKo: '박쥐 날개 하트 사탕봉', set: 'vampire2', slot: 'weapon', tone: 'costume', batch: 5,
    concept: '빨간 하트 막대사탕에 작은 박쥐 날개, 줄무늬 막대',
    art:
      'a cute red heart-shaped lollipop wand with little black bat wings on both sides, a tiny pair of fangs drawn on the heart, a black and red striped stick with a ribbon bow, ' +
      'cute and festive, clearly a wand weapon, no text, large, diagonal',
  },
  {
    key: 'hw5_vamp_cape', nameKo: '박쥐 백작 망토', set: 'vampire2', slot: 'armor', tone: 'costume', batch: 5,
    concept: '몸보다 큰 높은 깃 망토(빨간 안감, 작은 박쥐 무늬), 귀여운 미니 연미복',
    art:
      'a cute little vampire costume: an oversized black cape with a tall pointed collar and a bright red lining dotted with tiny bat prints, ' +
      'a short black tailcoat with a red bow at the neck, puffy shorts, striped stockings and little buckled shoes, cute and festive',
  },
  {
    key: 'hw5_vamp_headband', nameKo: '쫑긋 박쥐 날개 머리띠', set: 'vampire2', slot: 'accessory', tone: 'costume', batch: 5,
    concept: '머리띠 양쪽에 작은 박쥐 날개, 가운데 빨간 보석',
    art:
      'a cute headband with two small black bat wings perked up on both sides and a little red heart gem in the middle, soft plush look, cute and festive',
  },
  // ══ 6차(10-26): 대장장이 장신구 교체(보안경이 '재를 막는 눈'과 겹침) A 가죽 장갑·C 이마띠 + 메이드·집사 통합 세트 '유령 저택 하인'(귀여운 코스튬) ══
  {
    key: 'hw6_smith_gloves', nameKo: '불똥 앉은 가죽 장갑', set: 'smith6', slot: 'accessory', tone: 'bright', batch: 6,
    concept: '두꺼운 가죽 작업 장갑 한 켤레, 불똥 자국, 손목 놋쇠 버클',
    art:
      "a pair of thick brown leather blacksmith work gloves with long cuffs, small dark ember burn marks scattered on the fingers, brass buckles and stitched reinforcement patches at the wrists, " +
      'sturdy and finely crafted',
  },
  {
    key: 'hw6_smith_band', nameKo: '인장 박은 가죽 이마띠', set: 'smith6', slot: 'accessory', tone: 'bright', batch: 6,
    concept: '땀받이 가죽 이마띠, 가운데 망치·모루 인장 놋쇠 판',
    art:
      'a dark brown leather sweatband headband tied at the back with two short leather cords, a polished brass plate in the front stamped with a hammer-and-anvil seal, ' +
      'fine stitching along the edges, sturdy and finely crafted',
  },
  {
    key: 'hw6_house_tray', nameKo: '사탕 숨긴 은쟁반', set: 'household', slot: 'weapon', tone: 'costume', batch: 6,
    concept: '클로시를 덮은 은 쟁반, 뚜껑이 살짝 들려 안에 사탕과 작은 호박이 보임',
    art:
      'a shiny silver serving tray with a domed silver cloche lid lifted slightly open, wrapped candies and a tiny jack-o-lantern peeking out from inside, ' +
      'a little black bat-wing knob on top of the lid, cute and festive, clearly a held tray weapon, no text, large, diagonal',
  },
  {
    key: 'hw6_house_dress', nameKo: '유령 저택 하인복(메이드)', set: 'household', slot: 'armor', tone: 'costume', batch: 6,
    concept: '여성 장착판 — 검정 메이드 원피스, 흰 프릴 앞치마(가장자리 주황), 작은 박쥐 무늬',
    art:
      'a cute Halloween maid costume: a short-sleeved black dress with puffed sleeves, a white frilly apron trimmed in orange with tiny bat prints, ' +
      'a purple ribbon at the waist, white frilled socks and black strap shoes, cute and festive',
  },
  {
    key: 'hw6_house_suit', nameKo: '유령 저택 하인복(집사)', set: 'household', slot: 'armor', tone: 'costume', batch: 6,
    concept: '남성 장착판 — 짧은 검정 연미복, 주황 안감, 보라 조끼, 흰 장갑',
    art:
      "a cute Halloween butler costume: a short black tailcoat with an orange lining, a purple waistcoat with little pumpkin buttons, a white shirt, " +
      'white gloves, black trousers and polished shoes, cute and festive, a boy\'s outfit',
  },
  {
    key: 'hw6_house_keys', nameKo: '해골 열쇠 꾸러미', set: 'household', slot: 'accessory', tone: 'costume', batch: 6,
    concept: '허리에 거는 저택 열쇠 꾸러미, 해골·박쥐·호박 모양 열쇠',
    art:
      'a big ring of antique mansion keys to hang at the waist, keys with little skull, bat and pumpkin shaped bows, a small brass tag, cute and spooky',
  },
  {
    key: 'hw6_house_tie', nameKo: '호박 단추 리본 타이', set: 'household', slot: 'accessory', tone: 'costume', batch: 6,
    concept: '메이드·집사 공용 목 리본 — 검정 리본 타이, 가운데 작은 호박 단추, 흰 레이스 깃',
    art:
      'a black satin ribbon bow tie on a small white lace collar, a tiny orange pumpkin button in the center of the bow, short ribbon tails, cute and festive',
  },
  // ══ 7차(2026-10-26) — 대장장이 무기·장신구 다시(5차 앞치마 확정), 꼬마 뱀파이어 다른 종류, 사탕 세트 ══
  {
    key: 'hw7_smith_bellows', nameKo: '풀무 단 단조망치', set: 'smith7', slot: 'weapon', tone: 'bright', batch: 7,
    concept: '자루에 작은 가죽 풀무, 놋쇠 주둥이가 망치 머리를 향함, 한쪽 면이 달궈져 불씨',
    art:
      "a master blacksmith's forging hammer with a small leather hand bellows mounted along the handle, its brass nozzle pointing at the hammer head, one face of the steel head glowing orange-hot with tiny embers, a dark wood handle wrapped in leather with polished brass bands, finely crafted, large, diagonal",
  },
  {
    key: 'hw7_smith_starhammer', nameKo: '별쇠 모루망치', set: 'smith7', slot: 'weapon', tone: 'bright', batch: 7,
    concept: '망치 머리가 작은 모루 모양, 별빛 반점이 박힌 검은 운석 쇠, 놋쇠 고리',
    art:
      'a heavy blacksmith hammer whose head is shaped like a small anvil, forged from dark meteoric iron speckled with tiny glittering star-like flecks, a faint cool blue sheen along the edges, a polished brass collar, a leather-wrapped dark wood handle, finely crafted, large, diagonal',
  },
  {
    key: 'hw7_smith_kerchief', nameKo: '장인의 두건', set: 'smith7', slot: 'accessory', tone: 'bright', batch: 7,
    concept: '녹슨 붉은빛 면 두건, 앞단에 가죽 띠·놋쇠 리벳·망치 모루 배지, 작은 불똥 자국',
    art:
      "a blacksmith's head kerchief: a dark rust-red cotton scarf tied at the back with two short tails, a brown leather band sewn along the front edge with brass rivets and a small embossed hammer-and-anvil badge, a few tiny ember burn marks, finely crafted",
  },
  {
    key: 'hw7_smith_brooch', nameKo: '모루 브로치', set: 'smith7', slot: 'accessory', tone: 'bright', batch: 7,
    concept: '작은 모루 모양 브로치, 놋쇠·검은 강철, 망치 각인, 가운데 호박빛 보석',
    art:
      "an ornate brooch shaped like a small blacksmith's anvil, polished brass and dark steel, a tiny crossed hammer engraved on its face, a small amber stone set in the center, fine filigree edges, finely crafted",
  },
  {
    key: 'hw7_vamp_parasol', nameKo: '레이스 박쥐 양산', set: 'vampire3', slot: 'weapon', tone: 'costume', batch: 7,
    concept: '검은 레이스 양산, 캐노피에 작은 빨간 박쥐 무늬, 박쥐 모양 손잡이, 와인빛 리본',
    art:
      'a cute small black lace parasol, opened, with scalloped lace edges and tiny red bat silhouettes on the canopy, a curved handle shaped like a little bat with spread wings, a wine-red ribbon tied below the canopy, clearly a held parasol weapon, diagonal',
  },
  {
    key: 'hw7_vamp_rosecane', nameKo: '핏빛 장미 지팡이', set: 'vampire3', slot: 'weapon', tone: 'costume', batch: 7,
    concept: '짧은 검은 지팡이 끝에 큰 진홍 장미, 장미 아래 은 박쥐 날개 잎',
    art:
      'a short black walking cane topped with a large deep-red rose made of glossy enamel, small silver bat-wing shaped leaves under the rose, a silver tip at the bottom, diagonal',
  },
  {
    key: 'hw7_vamp_vest', nameKo: '꼬마 백작 조끼 세트', set: 'vampire3', slot: 'armor', tone: 'costume', batch: 7,
    concept: '와인빛 벨벳 조끼(박쥐 은단추), 흰 프릴 셔츠, 멜빵 반바지, 무릎 양말',
    art:
      "a cute little count costume: a wine-red velvet waistcoat with small bat-shaped silver buttons over a white frilly jabot shirt, short black shorts with suspenders, black knee socks and shiny buckled shoes, a boy's outfit",
  },
  {
    key: 'hw7_vamp_dress', nameKo: '높은 깃 망토 원피스', set: 'vampire3', slot: 'armor', tone: 'costume', batch: 7,
    concept: '검정·와인 프릴 원피스, 높게 선 깃, 짧은 케이프, 박쥐 단추, 줄무늬 스타킹',
    art:
      'a cute little vampire costume dress: a black and wine-red frilled dress with a tall stand-up collar, a short attached capelet, bat-shaped buttons down the front, black lace trim, striped stockings and black ribbon shoes',
  },
  {
    key: 'hw7_vamp_tophat', nameKo: '박쥐 미니 실크햇', set: 'vampire3', slot: 'accessory', tone: 'costume', batch: 7,
    concept: '작은 검은 실크햇, 와인빛 띠, 박쥐 모양 리본, 가운데 빨간 보석',
    art:
      'a tiny black silk top hat, a wine-red satin band and a ribbon bow shaped like a bat, a small red gem at the center of the bow',
  },
  {
    key: 'hw7_vamp_fang', nameKo: '은 송곳니 펜던트', set: 'vampire3', slot: 'accessory', tone: 'costume', batch: 7,
    concept: '귀여운 송곳니 한 쌍 모양 은 펜던트, 사이에 작은 빨간 보석 방울, 가는 은 사슬',
    art:
      'a small silver pendant shaped like a pair of cute vampire fangs, a tiny red gem drop hanging between them, on a fine silver chain',
  },
  {
    key: 'hw7_candy_scythe', nameKo: '줄무늬 사탕 낫', set: 'candy', slot: 'weapon', tone: 'costume', batch: 7,
    concept: '빨강·흰 줄무늬 지팡이 사탕을 휘어 만든 낫, 반짝이는 사탕 광택, 민트 리본',
    art:
      'a playful scythe made from a giant red-and-white striped candy cane bent into a long curved blade, glossy hard-candy shine, a mint-green ribbon bow at the joint, diagonal',
  },
  {
    key: 'hw7_candy_lolly', nameKo: '소용돌이 막대사탕 지팡이', set: 'candy', slot: 'weapon', tone: 'costume', batch: 7,
    concept: '분홍·민트·레몬 소용돌이 큰 막대사탕, 줄무늬 손잡이, 셀로판 포장과 리본',
    art:
      'a long staff topped with a giant glossy swirl lollipop in pastel pink, mint and lemon spirals, a striped candy-stick handle, a sheer cellophane wrap tied with a ribbon around the lollipop, diagonal',
  },
  {
    key: 'hw7_candy_dress', nameKo: '사탕 포장 리본 드레스', set: 'candy', slot: 'armor', tone: 'costume', batch: 7,
    concept: '반짝이는 분홍 원피스, 어깨·허리에 비튼 셀로판 포장 장식, 줄무늬 띠, 흰 프릴 속치마',
    art:
      'a cute candy costume dress shaped like wrapped sweets: a glossy pastel pink dress with twisted cellophane-wrapper puffs at the shoulders and hips, sparkly translucent ribbon trims, a wide candy-striped sash, a white frilly petticoat, pastel shoes',
  },
  {
    key: 'hw7_candy_coat', nameKo: '젤리빈 단추 코트', set: 'candy', slot: 'armor', tone: 'costume', batch: 7,
    concept: '짧은 민트 코트, 물결 깃, 색색 젤리빈 단추, 줄무늬 소맷단, 사탕 모양 주머니',
    art:
      'a cute short pastel mint coat with a scalloped collar, round glossy jellybean buttons in many colors, candy-striped cuffs and hem, little wrapped-candy shaped pockets, white tights and pastel shoes',
  },
  {
    key: 'hw7_candy_pin', nameKo: '눈깔사탕 머리핀', set: 'candy', slot: 'accessory', tone: 'costume', batch: 7,
    concept: '큰 동그란 소용돌이 사탕을 단 머리핀 한 쌍, 양옆에 비튼 포장 끝',
    art:
      'a pair of cute hair clips topped with big round glossy hard candies with colorful swirl patterns, tiny twisted wrapper ends on both sides like real wrapped candy',
  },
  {
    key: 'hw7_candy_necklace', nameKo: '알사탕 구슬 목걸이', set: 'candy', slot: 'accessory', tone: 'costume', batch: 7,
    concept: '분홍·민트·레몬·라벤더 알사탕을 꿴 목걸이, 가운데 소용돌이 사탕 펜던트, 리본 고리',
    art:
      'a cute necklace strung with round glossy hard candies in pastel pink, mint, lemon and lavender, a larger swirl candy pendant in the center, a small satin ribbon clasp',
  },  // ══ 8차(2026-10-27) — 대장장이 망치 여러 컨셉, 검은 고양이 분장(남녀 공용) ══
  {
    key: 'hw8_smith_heirloom', nameKo: '금 상감 가보 망치', set: 'smith8', slot: 'weapon', tone: 'bright', batch: 8,
    concept: '짙은 강철 머리에 금 상감 무늬, 자루 끝 모루 모양 금 장식, 호두나무 자루·땋은 가죽',
    art:
      "a master blacksmith's heirloom forging hammer, a dark steel head inlaid with flowing gold filigree patterns, a small anvil-shaped gold pommel at the end of the handle, a polished walnut handle with a braided leather grip and brass bands, elegant and finely crafted, large, diagonal",
  },
  {
    key: 'hw8_smith_crystal', nameKo: '수정 쐐기 망치', set: 'smith8', slot: 'weapon', tone: 'bright', batch: 8,
    concept: '강철 머리에 은은히 빛나는 푸른 수정 쐐기, 새김 무늬, 놋쇠 고리 자루',
    art:
      'a blacksmith hammer with a clear pale-blue crystal wedge set into the steel head, the crystal softly glowing, engraved steel cheeks, a leather-wrapped dark wood handle with brass rings, finely crafted, large, diagonal',
  },
  {
    key: 'hw8_smith_bat', nameKo: '박쥐 날개 쇠망치', set: 'smith8', slot: 'weapon', tone: 'bright', batch: 8,
    concept: '머리 양옆에 연철 박쥐 날개, 가운데 호박빛 리벳, 가죽 감은 자루',
    art:
      'a blacksmith hammer with small wrought-iron bat wings forged onto both sides of the head, a tiny orange-glowing pumpkin-shaped rivet in the center, a leather-wrapped dark wood handle with brass bands, playful Halloween style, finely crafted, large, diagonal',
  },
  {
    key: 'hw8_smith_gear', nameKo: '톱니바퀴 장인 망치', set: 'smith8', slot: 'weapon', tone: 'bright', batch: 8,
    concept: '머리에 놋쇠 톱니바퀴와 작은 압력계, 자루를 감은 구리관, 놋쇠 리벳 손잡이',
    art:
      "an inventor blacksmith's hammer with a brass gear wheel and a small pressure dial mounted on the steel head, copper pipes curling along the handle, a leather grip with brass rivets, finely crafted, large, diagonal",
  },
  {
    key: 'hw8_cat_wand', nameKo: '털실 방울 고양이 지팡이', set: 'cat', slot: 'weapon', tone: 'costume', batch: 8,
    concept: '짧은 검은 지팡이 끝에 노란 눈 고양이 머리, 보라 털실 방울과 금방울',
    art:
      'a cute short black wand topped with a little black cat head with big yellow eyes and pointy ears, a fluffy purple yarn pompom and a small golden bell hanging below, diagonal',
  },
  {
    key: 'hw8_cat_suit', nameKo: '검은 고양이 후드 점프수트', set: 'cat', slot: 'armor', tone: 'costume', batch: 8,
    concept: '남녀 공용 — 고양이 귀 후드 점프수트, 흰 가슴털, 발바닥 소맷단, 꼬리, 고양이 발 슬리퍼',
    art:
      'a cute unisex black cat costume: a soft black hooded jumpsuit with little cat ears on the hood, a white fluffy chest patch, pink paw-print pads on the cuffs, a long curled black tail at the back, black paw slippers',
  },
  {
    key: 'hw8_cat_collar', nameKo: '금방울 리본 목걸이', set: 'cat', slot: 'accessory', tone: 'costume', batch: 8,
    concept: '빨간 벨벳 리본 초커, 가운데 반짝이는 금방울, 작은 보라 리본',
    art:
      'a cute red velvet ribbon choker with a shiny golden bell in the center and a small purple bow',
  },
  // ── 9차(10-27) — 확정 세트 다듬기: 7차 두건·양산을 장식/리본 없이 다시 ──
  {
    key: 'hw9_smith_kerchief', nameKo: '장인의 두건', set: 'final9', slot: 'accessory', tone: 'bright', batch: 9,
    concept: '7차 두건을 장식 없이 — 녹슨 붉은빛 면 두건만, 뒤로 묶은 짧은 끝 두 가닥',
    art:
      "a plain blacksmith's head kerchief: a simple dark rust-red cotton scarf tied at the back with two short tails, soft natural cloth folds, finely crafted",
  },
  {
    key: 'hw9_vamp_parasol', nameKo: '레이스 박쥐 양산', set: 'final9', slot: 'weapon', tone: 'costume', batch: 9,
    concept: '7차 양산을 리본 없이 — 검은 레이스 캐노피, 빨간 박쥐 무늬, 박쥐 손잡이',
    art:
      'a cute small black lace parasol, opened, with scalloped lace edges and tiny red bat silhouettes on the canopy, a slender black shaft with a pointed silver tip, a curved handle shaped like a little bat with spread wings, clearly a held parasol weapon, diagonal',
  },
];

export function promptOf(c: HalloweenCand): string {
  const tail = (c.tone === 'bright' ? TAIL_BRIGHT : c.tone === 'costume' ? TAIL_COSTUME : TAIL_DARK)[c.tailAs ?? c.slot];
  return `${c.art}, ${tail}`;
}

function rememberedObject(itemKey: string): string {
  try {
    const m = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as Record<string, { key: string; objectId: string }>;
    return m[itemKey]?.key === LABEL ? (m[itemKey].objectId ?? '') : '';
  } catch {
    return '';
  }
}

function rememberObject(itemKey: string, objectId: string): void {
  let m: Record<string, { key: string; objectId: string }> = {};
  try {
    if (existsSync(MAP_PATH)) m = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  } catch {
    m = {};
  }
  m[itemKey] = { key: LABEL, objectId };
  writeFileSync(MAP_PATH, JSON.stringify(m, null, 2) + '\n');
}

function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const u = pickUrl(x);
      if (u) return u;
    }
  }
  return null;
}

async function genOne(c: HalloweenCand, key: string): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(OUT_DIR, `${c.key}.png`);
  if (existsSync(out)) return 'skip';
  // 생성은 됐는데 내려받다 끊긴 경우 — 기록된 객체 id로 결과만 다시 받는다(추석 11차에서 이중 과금 경험).
  let objectId = rememberedObject(c.key);
  if (objectId) console.log(`  ${c.key} 기록된 객체 재사용(생성 요청 없음)`);
  for (let attempt = 0; attempt < 5 && !objectId; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PIX}/create-1-direction-object`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ description: promptOf(c), size: SIZE, view: 'sidescroller' }),
      });
    } catch (e) {
      console.error(`  ${c.key} 네트워크 — 재시도: ${(e as Error).message}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429) {
      await sleep(3000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      console.error(`  ${c.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return 'fail';
    }
    const j = (await res.json()) as { object_id?: string };
    objectId = j.object_id ?? '';
    if (objectId) rememberObject(c.key, objectId);
    break;
  }
  if (!objectId) return 'fail';
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response;
    try {
      g = await fetch(`${PIX}/objects/${objectId}`, { headers: { authorization: `Bearer ${key}` } });
    } catch {
      continue;
    }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) return 'fail';
      let buf: Buffer | null = null;
      for (let d = 0; d < 4 && !buf; d++) {
        try {
          buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        } catch (e) {
          console.error(`  ${c.key} 내려받기 — 재시도: ${(e as Error).message}`);
          await sleep(1500 * 2 ** d);
        }
      }
      if (!buf || buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return 'fail';
      writeFileSync(out, buf);
      return 'ok';
    }
    if (gj.status === 'failed') return 'fail';
  }
  console.error(`  ${c.key} 폴링 타임아웃(객체 id 기록됨: ${objectId})`);
  return 'fail';
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const batchArg = Number(process.argv.find((a) => a.startsWith('--batch='))?.slice(8) ?? 0);
  const pool = batchArg ? CANDIDATES.filter((c) => c.batch === batchArg) : CANDIDATES;
  const list = only ? pool.filter((c) => only.includes(c.key)) : pool;
  if (process.argv.includes('--dry')) {
    for (const c of list) console.log(`[${SET_NAME[c.set]}/${c.slot}] ${c.key} ${c.nameKo}\n  ${promptOf(c)}\n`);
    return;
  }
  const { key, envName } = scriptKeyFor(LABEL);
  if (!key) {
    console.error(`${envName} 필요 — .env.local`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`할로윈 후보 ${list.length}종 — Pixellab 객체(sidescroller, ${SIZE}px, ${LABEL})\n`);
  // 동시성: 기본 1(429 회피 관례). --concurrency=N으로 올릴 수 있다(10-20 사용자 요청: 남은 분량 4개씩).
  const concurrency = Math.max(1, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) ?? 1) || 1);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const c = list[next++]!;
      const r = await genOne(c, key);
      if (r === 'ok') ok += 1;
      else if (r === 'skip') skip += 1;
      else fail += 1;
      console.log(`  ${r === 'ok' ? '✓' : r === 'skip' ? '·' : '✗'} [${c.slot}] ${c.key.padEnd(26)} ${c.nameKo}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  console.log(`\n완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

// 직접 실행할 때만 생성한다 — 검토 페이지 빌더가 CANDIDATES만 가져다 쓸 때 유료 호출이 나가지 않게.
if (process.argv[1]?.endsWith('gen-halloween-cand.ts')) void main();
