// 무기 교체 후보 10종 — Pixellab **객체**(create-1-direction-object) → public/sprites/weapon-cand/<key>.png
// 실행: bun run scripts/gen-weapon-cand.ts            (누락분만 — 재개형)
//       bun run scripts/gen-weapon-cand.ts --only=key1,key2
//
// ⚠ 반드시 **객체**로 만든다(pixflux 아님). 이유 둘:
//   ① 화풍 — 기존 120종이 전부 create-1-direction-object(view=sidescroller)로 만들어졌다.
//      pixflux는 다른 모델이라 나란히 놓으면 톤이 튄다(2026-08-14 실측: 1차 시도가 이 실수였다).
//   ② 애니 — 아이템 애니는 POST /objects/{id}/animations로 **객체에만** 붙는다. 객체 id 없이
//      만든 이미지는 나중에 애니를 영영 못 붙인다. 그래서 생성 즉시 id를 기록해 둔다
//      (2026-08-04에 기록 누락으로 17종을 목록 조회로 사후 복구한 전례가 있다).
//
// 프롬프트 형식은 keeper(사용자 확정 아이템) 정본을 따른다:
//   "<형태·재질·색>, <형용사> and <형용사>, clearly a <종류> weapon, no text, large, diagonal" + TAIL
//   · `clearly a <종류> weapon` — 실루엣 오독 방지 앵커(weapon-kind.ts가 사전으로 못 박은 그 문제)
//   · TAIL — 슬롯 품질 꼬리표. **not gothic**·애니/JRPG 톤이 핵심(아바타가 일본 애니메 미소년/미소녀)
//
// 아바타 안전 설계: **전부 단일 무기**(쌍무기는 중복·포즈 상충 실측 최다), 늘어지는 부속 최소
// (거절 6/7이 하반신 프레임 잘림).
import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

// key1 고정(사용자 지정) — 애니 생성은 객체를 만든 같은 키로만 가능하므로 신규는 key1로 통일한다.
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}

const PIX = 'https://api.pixellab.ai/v2';
const SIZE = 256; // >170 → 단일 후보(review 단계 없이 바로 완료)
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'sprites', 'weapon-cand');
const MAP_PATH = join(ROOT, 'scripts', 'obj-map-cand.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** items-v2.ts TAIL.weapon 정본 — 슬롯 품질 꼬리표(수정 금지, 기존 120종과 동일해야 화풍이 맞는다). */
const TAIL =
  'a beautiful clean fantasy anime RPG gacha-game weapon, bright and stylish, not gothic, ' +
  'a single isolated object on a plain flat empty background, large, pixel art';

type Cand = { key: string; nameKo: string; region: string; group: '웅장' | '코스튬'; art: string };

const CANDIDATES: Cand[] = [
  // ── 6종: 지역색 · 화려하고 웅장 ─────────────────────────────────────────────
  {
    key: 'kingdom_lionheart_axe',
    nameKo: '사자심 대부',
    region: '왕국',
    group: '웅장',
    art:
      'a grand royal battle axe — a broad mirror-silver crescent head with gold filigree along its edge, ' +
      'a roaring golden lion crest at the collar, a deep blue enameled haft bound in gold rings, ' +
      'regal and commanding, clearly a battle axe weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_moltencore_flail',
    nameKo: '용암심 철퇴',
    region: '화산',
    group: '웅장',
    art:
      'a molten-core flail — a heavy dark iron spiked ball split by glowing orange lava seams, ' +
      'a short thick chain of blackened links, a bronze-capped grip wrapped in scorched leather, ' +
      'fierce and blazing, clearly a flail weapon, no text, large, diagonal',
  },
  {
    key: 'angel_vesper_glaive',
    nameKo: '만종 언월도',
    region: '타락천사',
    group: '웅장',
    art:
      'a vesper glaive — one long sweeping silver crescent blade with a pale gold edge, ' +
      'a winged collar of layered feathers where blade meets shaft, a tall slender dark shaft with gold bands, ' +
      'solemn and radiant, clearly a glaive polearm weapon, no text, large, diagonal',
  },
  {
    key: 'rune_stonewarden_maul',
    nameKo: '석수의 대추',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a stonewarden maul — a massive squared granite head bound in thick iron straps, ' +
      'glowing pale-blue rune lines carved deep across its faces, a stout banded shaft with a leather grip, ' +
      'ancient and thunderous, clearly a two-handed maul hammer weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_bogbloom_bardiche',
    nameKo: '늪꽃 장부',
    region: '늪지대',
    group: '웅장',
    art:
      'a bogbloom bardiche — a long curved axe blade of mottled green-bronze mounted along a tall shaft, ' +
      'pale lotus blossoms and creeping vines growing over the blade socket, dark damp wood, ' +
      'wild and majestic, clearly a bardiche axe polearm weapon, no text, large, diagonal',
  },
  {
    key: 'temple_sanctus_mace',
    nameKo: '성전 철퇴',
    region: '신전',
    group: '웅장',
    art:
      'a sanctus mace — a flanged head of white marble and gold with a small stained-glass window set in its crown, ' +
      'radiant warm light glowing from within, an ivory shaft ringed in gold, ' +
      'holy and magnificent, clearly a mace weapon, no text, large, diagonal',
  },

  // ── 4종: 코스튬 무기 · 아바타 친화(가볍고 실루엣 단순, 의상과 어울림) ────────
  {
    key: 'temple_moonring_chakram',
    nameKo: '월륜',
    region: '신전',
    group: '코스튬',
    art:
      'a moonring chakram — a single flat ring blade of pale jade and polished silver with a keen outer rim, ' +
      'delicate crescent engravings across the face, a soft white cord wrapping the inner grip, ' +
      'graceful and serene, clearly a chakram throwing ring weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_courtfan_warfan',
    nameKo: '궁정 철선',
    region: '왕국',
    group: '코스튬',
    art:
      'an opened court war fan — slender steel ribs edged like blades holding a pale blue silk leaf ' +
      'painted with fine gold blossoms, a small tassel at the pivot, ' +
      'refined and dazzling, clearly a folding war fan weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_dewblade_dagger',
    nameKo: '이슬날 단검',
    region: '늪지대',
    group: '코스튬',
    art:
      'a single dewblade dagger — a short slim leaf-shaped blade of clear pale green glass ' +
      'with a dewdrop gem in the guard, a slender silver hilt wrapped in soft green cord, ' +
      'dainty and luminous, clearly a single dagger weapon, no text, large, diagonal',
  },
  {
    key: 'angel_lace_parasol',
    nameKo: '레이스 양산검',
    region: '타락천사',
    group: '코스튬',
    art:
      'a lace parasol blade — an opened white lace parasol with fine gold ribbing and a scalloped feathered trim, ' +
      'its slender shaft ending in a polished silver blade tip, a looped ribbon handle, ' +
      'elegant and charming, clearly a parasol-shaped weapon, no text, large, diagonal',
  },

  // ══ 2차 20종(동일 비율 웅장 12 · 코스튬 8) ═══════════════════════════════════
  // ── 웅장 12: 지역색 · 화려 ──────────────────────────────────────────────────
  {
    key: 'orc_bloodtusk_greataxe',
    nameKo: '피엄니 대부',
    region: '오크 부락',
    group: '웅장',
    art:
      'a bloodtusk greataxe — a huge double-bitted axe with two broad chipped iron blades, ' +
      'curved boar tusks lashed to the collar with red cord, a thick rough timber haft bound in hide, ' +
      'brutal and imposing, clearly a two-handed greataxe weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_emberstar_morningstar',
    nameKo: '잿별 성구',
    region: '화산',
    group: '웅장',
    art:
      'an emberstar morning star — a rigid haft topped by a round spiked ball of dark iron, ' +
      'each spike tipped with glowing ember light, faint sparks rising, a bronze collar and wrapped grip, ' +
      'savage and radiant, clearly a morning star mace weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_lionguard_estoc',
    nameKo: '사자근위 자검',
    region: '왕국',
    group: '웅장',
    art:
      'a lionguard estoc — a very long narrow triangular thrusting blade of polished steel, ' +
      'an ornate gold basket hilt shaped from lion manes, a sapphire pommel, ' +
      'noble and precise, clearly an estoc thrusting sword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_ringstaff_khakkhara',
    nameKo: '육환 석장',
    region: '신전',
    group: '웅장',
    art:
      'a ringed pilgrim khakkhara staff — a tall pale wooden shaft crowned by a golden pagoda finial ' +
      'hung with six loose jingling rings, a silk knot below the head, ' +
      'sacred and stately, clearly a ringed monk staff weapon, no text, large, diagonal',
  },
  {
    key: 'rune_obelisk_club',
    nameKo: '오벨리스크 곤',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'an obelisk war club — a long tapering block of dark blue stone carved with columns of glowing ' +
      'pale runes, iron banding near the base, a short wrapped grip, ' +
      'primordial and heavy, clearly a stone war club weapon, no text, large, diagonal',
  },
  {
    key: 'angel_judgment_scythe',
    nameKo: '심판의 대낫',
    region: '타락천사',
    group: '웅장',
    art:
      'a judgment great scythe — one huge sweeping silver crescent blade with a golden inner edge, ' +
      'a tall black shaft with a winged joint and a small hanging balance-scale charm, ' +
      'grave and magnificent, clearly a scythe polearm weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_gharial_harpoon',
    nameKo: '악어 작살',
    region: '늪지대',
    group: '웅장',
    art:
      'a gharial harpoon — a long barbed spearhead of green-tarnished bronze with backward hooks, ' +
      'a coil of wet rope at the socket, a dark waterlogged wooden shaft, ' +
      'rugged and fearsome, clearly a harpoon spear weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_dragonbone_poleaxe',
    nameKo: '용골 부월',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a dragonbone poleaxe — a pale bone axe blade paired with a back spike on a long charred shaft, ' +
      'small dragon vertebrae threaded below the head, faint heat glow along the edge, ' +
      'monstrous and grand, clearly a poleaxe polearm weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_lionpike',
    nameKo: '사자 장창',
    region: '왕국',
    group: '웅장',
    art:
      'a royal lion pike — an extremely long slender polearm with a slim steel leaf head, ' +
      'a gold lion-head collar and a short blue pennon, a lacquered blue shaft, ' +
      'disciplined and splendid, clearly a long pike polearm weapon, no text, large, diagonal',
  },
  {
    key: 'orc_bonesaw_cleaver',
    nameKo: '뼈톱 대도',
    region: '오크 부락',
    group: '웅장',
    art:
      'a bonesaw cleaver — a massive rectangular chopping blade with a jagged saw-toothed spine, ' +
      'riveted iron plates and a crude bone-wrapped handle, ' +
      'crude and overwhelming, clearly a huge cleaver sword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_bellringer_hammer',
    nameKo: '범종 망치',
    region: '신전',
    group: '웅장',
    art:
      'a bellringer war hammer — a heavy bronze temple-bell shaped head engraved with sutra bands, ' +
      'a soft golden ring of light around it, a long pale shaft with a braided cord, ' +
      'resonant and solemn, clearly a war hammer weapon, no text, large, diagonal',
  },
  {
    key: 'angel_reliquary_greatsword',
    nameKo: '성물 대검',
    region: '타락천사',
    group: '웅장',
    art:
      'a reliquary greatsword — a broad white-gold blade with a small glass reliquary window set near the guard ' +
      'holding a single glowing feather, a winged crossguard, a wrapped ivory grip, ' +
      'devout and majestic, clearly a greatsword weapon, no text, large, diagonal',
  },

  // ── 코스튬 8: 아바타 친화 · 가볍고 실루엣 단순 ─────────────────────────────
  {
    key: 'kingdom_mirror_blade',
    nameKo: '거울검',
    region: '왕국',
    group: '코스튬',
    art:
      'a mirror blade — a slim straight sword whose flat is a flawless reflective mirror with a faint ' +
      'rainbow sheen, a delicate silver frame-like guard, a pearl-white grip, ' +
      'pristine and lovely, clearly a single sword weapon, no text, large, diagonal',
  },
  {
    key: 'angel_quill_blade',
    nameKo: '깃펜검',
    region: '타락천사',
    group: '코스튬',
    art:
      'a quill blade — a slender sword shaped like a writing quill, its blade a long white feather of ' +
      'polished metal narrowing to a fine nib point, a small gold ink-drop gem at the base, ' +
      'whimsical and elegant, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_lotus_wand',
    nameKo: '연화 완드',
    region: '신전',
    group: '코스튬',
    art:
      'a lotus wand — a short pale rod topped with an opening pink lotus blossom of layered petals ' +
      'cradling a small clear gem, two soft ribbons at the collar, ' +
      'gentle and pretty, clearly a short magic wand weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_scissor_blade',
    nameKo: '가위날',
    region: '늪지대',
    group: '코스튬',
    art:
      'a scissor blade — a pair of long slim shears joined at a jeweled pivot forming one weapon, ' +
      'mint-green enamel handles with looped finger rings, keen silver edges, ' +
      'sharp and stylish, clearly a large scissor blade weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_hairpin_dagger',
    nameKo: '비녀 단검',
    region: '왕국',
    group: '코스튬',
    art:
      'a hairpin dagger — a long slender ornamental hairpin whose shaft is a needle-thin blade, ' +
      'its head a small gold plum blossom with a dangling pearl drop, ' +
      'delicate and refined, clearly a single slim dagger weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_ember_shortsword',
    nameKo: '잉걸 소검',
    region: '화산',
    group: '코스튬',
    art:
      'an ember shortsword — a compact broad-tipped blade with a warm orange gradient along the steel, ' +
      'a simple bronze guard and a red-cord wrapped grip, ' +
      'plucky and warm, clearly a single short sword weapon, no text, large, diagonal',
  },
  {
    key: 'rune_grimoire_tome',
    nameKo: '룬 마도서',
    region: '고대 룬 산맥',
    group: '코스튬',
    art:
      'a floating grimoire — a thick leather-bound tome held open in one hand, ' +
      'gilded page edges and a brass clasp, glowing blue runes lifting off the open pages, ' +
      'scholarly and magical, clearly a spellbook grimoire weapon, no text on the cover, large, diagonal',
  },
  {
    key: 'angel_orb_scepter',
    nameKo: '보주 홀',
    region: '타락천사',
    group: '코스튬',
    art:
      'an orb scepter — a short gold rod crowned by a floating clear crystal orb ringed by a thin halo band, ' +
      'small feathered wings at the collar, a tasseled cord below, ' +
      'regal and dreamy, clearly a short scepter weapon, no text, large, diagonal',
  },

  // ══ 3차 20종(동일 비율 웅장 12 · 코스튬 8) ═══════════════════════════════════
  // ── 웅장 12 ─────────────────────────────────────────────────────────────────
  {
    key: 'orc_kanabo_greatclub',
    nameKo: '낭아 철봉',
    region: '오크 부락',
    group: '웅장',
    art:
      'a studded kanabo war club — a long tapering iron bar densely covered in blunt pyramid studs, ' +
      'a flared banded base and a leather-wound grip with a hanging iron ring, ' +
      'crushing and imposing, clearly a studded iron war club weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_anchor_maul',
    nameKo: '침몰의 닻',
    region: '늪지대',
    group: '웅장',
    art:
      'a ship anchor wielded as a weapon — a huge rusted iron anchor with two hooked flukes and a heavy ring, ' +
      'strands of green weed and a short length of wet chain clinging to the shank, ' +
      'ponderous and grim, clearly an anchor weapon, no text, large, diagonal',
  },
  {
    key: 'temple_moonspade',
    nameKo: '월아산',
    region: '신전',
    group: '웅장',
    art:
      'a crescent moon spade — a long polearm with a wide upturned crescent blade at one end ' +
      'and a flat spade blade at the other, engraved brass fittings on a dark red shaft, ' +
      'disciplined and grand, clearly a monk crescent spade polearm weapon, no text, large, diagonal',
  },
  {
    key: 'angel_executioner_sword',
    nameKo: '집행의 검',
    region: '타락천사',
    group: '웅장',
    art:
      'an executioner sword — a very wide straight blade ending in a blunt squared tip, no point, ' +
      'a short simple crossguard, a long two-handed grip bound in black leather with a ring pommel, ' +
      'severe and commanding, clearly an executioner sword weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_drill_lance',
    nameKo: '천공 창',
    region: '화산',
    group: '웅장',
    art:
      'a drill lance — a massive conical spiral drill head of dark steel with glowing orange grooves, ' +
      'a reinforced collar of bolted plates, a thick armored shaft with a hand guard, ' +
      'mechanical and overwhelming, clearly a drill lance weapon, no text, large, diagonal',
  },
  {
    key: 'rune_warpick',
    nameKo: '룬 곡괭이',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a rune war pick — a long curved beak-like spike of blue-grey steel with a small hammer poll opposite, ' +
      'faint glowing runes etched along the spine, a wrapped haft with a stone counterweight, ' +
      'piercing and ancient, clearly a war pick weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_royal_musket',
    nameKo: '근위 장총',
    region: '왕국',
    group: '웅장',
    art:
      'a royal long musket — a slender long-barreled firearm with a polished walnut stock, ' +
      'engraved gold scrollwork on the lock and a lion crest, a slim ramrod under the barrel, ' +
      'ornate and stately, clearly a long musket firearm weapon, no text, large, diagonal',
  },
  {
    key: 'angel_grand_cross',
    nameKo: '대십자',
    region: '타락천사',
    group: '웅장',
    art:
      'a grand cross weapon — a towering white-stone cross with gilded edges and a sharpened lower stem, ' +
      'a stained-glass rose window at the crossing glowing softly, ' +
      'monumental and solemn, clearly a large cross-shaped weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_ballista_javelin',
    nameKo: '공성 투창',
    region: '왕국',
    group: '웅장',
    art:
      'a siege ballista javelin — an oversized bolt-like spear with a heavy four-sided steel head, ' +
      'three stiff bronze fins near the butt, a banded blue-lacquered shaft, ' +
      'weighty and precise, clearly a giant javelin spear weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_dragonhorn_trident',
    nameKo: '용각 삼지창',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a dragonhorn trident — three curved horn prongs of blackened bone tipped with molten red edges, ' +
      'a scaled bronze socket, a long dark shaft wrapped in red cord, ' +
      'ferocious and splendid, clearly a trident polearm weapon, no text, large, diagonal',
  },
  {
    key: 'rune_greatsaw',
    nameKo: '룬 대톱',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a rune greatsaw — a long rectangular saw blade with deep triangular teeth along one edge, ' +
      'pale runes glowing between the teeth, a bolted spine and a two-handed wrapped grip, ' +
      'brutal and arcane, clearly a giant saw blade weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_lion_towershield',
    nameKo: '사자 대방패',
    region: '왕국',
    group: '웅장',
    art:
      'a lion tower shield — a tall rounded rectangular shield faced in deep blue with a gold rampant lion, ' +
      'a studded steel rim and a sharpened lower edge, ' +
      'stalwart and regal, clearly a tower shield weapon, no text, large, diagonal',
  },

  // ── 코스튬 8 ────────────────────────────────────────────────────────────────
  {
    key: 'temple_hymn_lyre',
    nameKo: '성가 리라',
    region: '신전',
    group: '코스튬',
    art:
      'a hymn lyre — a small golden lyre with two curved arms and taut shining strings, ' +
      'a carved soundbox and a short ribbon at the yoke, faint motes of light near the strings, ' +
      'graceful and serene, clearly a lyre harp weapon, no text, large, diagonal',
  },
  {
    key: 'rune_ink_brush',
    nameKo: '먹빛 붓',
    region: '고대 룬 산맥',
    group: '코스튬',
    art:
      'an ink brush weapon — a long slim calligraphy brush with a lacquered black shaft and a jade ferrule, ' +
      'its soft tapered tip heavy with glowing indigo ink, a single drop falling, ' +
      'scholarly and elegant, clearly a calligraphy brush weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_bouquet_blade',
    nameKo: '꽃다발 검',
    region: '늪지대',
    group: '코스튬',
    art:
      'a bouquet blade — a slim sword whose guard blooms into a small gathered bouquet of pale marsh flowers, ' +
      'a wrapped paper collar and a soft green ribbon, a bright narrow blade above, ' +
      'sweet and striking, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_pendulum_chain',
    nameKo: '회중 추',
    region: '왕국',
    group: '코스튬',
    art:
      'a pocket-watch pendulum weapon — a polished gold pocket watch with an open engraved lid ' +
      'and a faceted crystal weight below, hanging from a short taut chain held at the top, ' +
      'hypnotic and dainty, clearly a pendulum pocket-watch weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_will_lantern',
    nameKo: '도깨비 등롱',
    region: '늪지대',
    group: '코스튬',
    art:
      'a wisp lantern — a small hexagonal iron-framed lantern with pale green glass panes, ' +
      'a drifting blue flame inside, a curved carrying hook at the top and a short tassel, ' +
      'eerie and charming, clearly a hand lantern weapon, no text, large, diagonal',
  },
  {
    key: 'angel_violin_blade',
    nameKo: '현음 검',
    region: '타락천사',
    group: '코스튬',
    art:
      'a violin blade — a slim sword shaped from a lacquered violin body, its neck extending into a ' +
      'bright narrow blade, f-holes and four fine strings along the flat, a scrolled pommel, ' +
      'lyrical and refined, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_gatekey_blade',
    nameKo: '성문 열쇠검',
    region: '신전',
    group: '코스튬',
    art:
      'a gate key blade — a sword shaped like an ornate key, its blade a slim shaft ending in ' +
      'squared key teeth, a large filigreed bow ring as the pommel, warm brass and ivory, ' +
      'quaint and ornate, clearly a key-shaped sword weapon, no text, large, diagonal',
  },
  {
    key: 'angel_candelabra_blade',
    nameKo: '촛대검',
    region: '타락천사',
    group: '코스튬',
    art:
      'a candelabra blade — a slender silver sword whose crossguard branches into three small arms ' +
      'holding lit white candles with soft flames, thin wax drips along the branches, ' +
      'gothic-free and tender, clearly a single slim sword weapon, no text, large, diagonal',
  },

  // ══ 4차 20종(동일 비율 웅장 12 · 코스튬 8) ═══════════════════════════════════
  // ── 웅장 12 ─────────────────────────────────────────────────────────────────
  {
    key: 'orc_greatclaw_gauntlet',
    nameKo: '맹수의 발톱',
    region: '오크 부락',
    group: '웅장',
    art:
      'a great claw gauntlet — a single heavy armored gauntlet with three long curved steel talons ' +
      'extending past the knuckles, riveted plates and a hide-bound wrist strap, ' +
      'savage and striking, clearly a clawed gauntlet weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_hand_cannon',
    nameKo: '용포',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a hand cannon — a short thick bronze barrel flaring at the muzzle, cast with a dragon head ' +
      'around the mouth, iron reinforcing bands and a stout wooden stock, faint smoke at the bore, ' +
      'thunderous and ornate, clearly a hand cannon firearm weapon, no text, large, diagonal',
  },
  {
    key: 'angel_grand_stake',
    nameKo: '형벌의 말뚝',
    region: '타락천사',
    group: '웅장',
    art:
      'a grand execution stake — a tall tapered iron spike with a squared hammered head, ' +
      'gold judgment script running down one face, a short chain ring near the top, ' +
      'stark and imposing, clearly a giant iron stake weapon, no text, large, diagonal',
  },
  {
    key: 'rune_masons_chisel',
    nameKo: '석공의 대정',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      "a mason's great chisel — an enormous flat-bladed chisel of pale steel with a wide beveled edge, " +
      'glowing runes cut into the shank, a mushroomed struck head and a stone-set collar, ' +
      'blunt and monumental, clearly a giant chisel weapon, no text, large, diagonal',
  },
  {
    key: 'temple_judgment_scales',
    nameKo: '심판의 저울',
    region: '신전',
    group: '웅장',
    art:
      'a judgment scales weapon — a tall gold balance with a beam and two hanging dishes, ' +
      'the central column sharpened into a blade below, fine chains and a jeweled fulcrum, ' +
      'solemn and ornate, clearly a balance scales weapon, no text, large, diagonal',
  },
  {
    key: 'temple_censer_chain',
    nameKo: '사슬 향로',
    region: '신전',
    group: '웅장',
    art:
      'a chained censer — a large pierced brass incense burner on a short taut chain held at the top, ' +
      'warm smoke curling from the vents, a domed lid with a small finial, ' +
      'ritual and grand, clearly a chained censer weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_blunderbuss',
    nameKo: '나팔총',
    region: '왕국',
    group: '웅장',
    art:
      'a blunderbuss — a short firearm with a wide flaring bell muzzle, a curved walnut stock ' +
      'inlaid with brass rosettes, an engraved lockplate and a brass trigger guard, ' +
      'bold and decorative, clearly a blunderbuss firearm weapon, no text, large, diagonal',
  },
  {
    key: 'angel_coffin_blade',
    nameKo: '관검',
    region: '타락천사',
    group: '웅장',
    art:
      'a coffin blade — a colossal slab-like sword shaped as a sealed hexagonal coffin lid, ' +
      'pale wood banded in gold with a small engraved plate, one long edge honed sharp, ' +
      'sombre and overwhelming, clearly a giant slab sword weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_jawbone_blade',
    nameKo: '턱뼈 검',
    region: '늪지대',
    group: '웅장',
    art:
      'a jawbone blade — a long curved crocodile jawbone still set with rows of yellowed teeth, ' +
      'bound with wet cord at the base into a grip, faint green algae in the seams, ' +
      'primal and fearsome, clearly a bone jaw blade weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_repeating_crossbow',
    nameKo: '연노',
    region: '왕국',
    group: '웅장',
    art:
      'a repeating crossbow — a compact crossbow with a tall box magazine over the stock ' +
      'and a lever arm behind it, lacquered blue wood with gold fittings and a steel prod, ' +
      'clever and refined, clearly a repeating crossbow weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_molten_ladle',
    nameKo: '용선 국자',
    region: '화산',
    group: '웅장',
    art:
      'a foundry ladle weapon — a deep round iron crucible bowl brimming with glowing molten metal ' +
      'on a very long reinforced handle, heat shimmer and drips at the lip, ' +
      'industrial and fierce, clearly a giant foundry ladle weapon, no text, large, diagonal',
  },
  {
    key: 'orc_meat_hook',
    nameKo: '도살 갈고리',
    region: '오크 부락',
    group: '웅장',
    art:
      'a butcher great hook — one massive curved iron hook with a wickedly tapered point, ' +
      'a thick banded shaft and a rope-wound grip, rust and nicks along the curve, ' +
      'crude and menacing, clearly a giant hook weapon, no text, large, diagonal',
  },

  // ── 코스튬 8 ────────────────────────────────────────────────────────────────
  {
    key: 'kingdom_musicbox_blade',
    nameKo: '오르골 검',
    region: '왕국',
    group: '코스튬',
    art:
      'a music box blade — a small lacquered music box with its lid open showing a turning cylinder, ' +
      'a slim silver blade rising from the box like a raised lid, a tiny gold crank on the side, ' +
      'whimsical and precious, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_ribbon_rod',
    nameKo: '리본 무봉',
    region: '왕국',
    group: '코스튬',
    art:
      'a ribbon rod — a very slim polished baton with a gold cap, trailing one long silk ribbon ' +
      'that loops in a wide smooth spiral, a small gem at the swivel, ' +
      'airy and graceful, clearly a ribbon baton weapon, no text, large, diagonal',
  },
  {
    key: 'temple_holywater_flask',
    nameKo: '성수 유리병',
    region: '신전',
    group: '코스튬',
    art:
      'a holy water flask — a rounded clear glass vessel of glowing pale water with a gold filigree ' +
      'cradle and stopper, a short chain loop at the neck, soft light through the glass, ' +
      'clean and devout, clearly a glass flask weapon, no text, large, diagonal',
  },
  {
    key: 'rune_compass_blade',
    nameKo: '나침 검',
    region: '고대 룬 산맥',
    group: '코스튬',
    art:
      'a compass blade — a slim sword whose guard is an open brass compass with a spinning needle ' +
      'over an engraved rose dial, faint blue runes on the narrow blade above, ' +
      'adventurous and elegant, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'rune_hourglass_rod',
    nameKo: '모래시계 지팡이',
    region: '고대 룬 산맥',
    group: '코스튬',
    art:
      'an hourglass rod — a short slim rod topped by a small brass-framed hourglass ' +
      'with glowing violet sand mid-fall, a thin filigree cage around the glass, ' +
      'mysterious and delicate, clearly a short hourglass rod weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_sewing_needle',
    nameKo: '대바늘',
    region: '늪지대',
    group: '코스튬',
    art:
      'a giant sewing needle — an oversized polished steel needle with a long slim body, ' +
      'a wide eye near the top threaded with one green silk strand trailing behind, ' +
      'quirky and sharp, clearly a giant needle weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_conch_horn',
    nameKo: '소라 고둥',
    region: '늪지대',
    group: '코스튬',
    art:
      'a conch horn — a large spiral shell of cream and rose with a polished pearl interior, ' +
      'a gold mouthpiece fitted at the tip and a woven teal cord, faint water droplets on the ridges, ' +
      'oceanic and pretty, clearly a conch shell horn weapon, no text, large, diagonal',
  },
  {
    key: 'angel_birdcage_lantern',
    nameKo: '새장',
    region: '타락천사',
    group: '코스튬',
    art:
      'a birdcage weapon — a small domed gold birdcage with slender bars and an open door, ' +
      'a glowing white feather drifting inside, a ring handle at the crown and a ribbon tie, ' +
      'wistful and ornate, clearly a birdcage weapon, no text, large, diagonal',
  },

  // ══ 재굴림본 2종 — 원본은 위에 그대로 두고 다른 결과를 나란히 본다 ═══════════
  {
    key: 'temple_ringstaff_khakkhara_v2',
    nameKo: '육환 석장 (재굴림)',
    region: '신전',
    group: '웅장',
    art:
      'a ringed pilgrim khakkhara staff — a tall pale wooden shaft crowned by a golden pagoda finial ' +
      'hung with six loose jingling rings, a silk knot below the head, ' +
      'sacred and stately, clearly a ringed monk staff weapon, no text, large, diagonal',
  },
  {
    key: 'angel_lace_parasol_v2',
    nameKo: '레이스 양산검 (재굴림)',
    region: '타락천사',
    group: '코스튬',
    // 깃털 트리밍 제거 — 깃털은 아바타 생성기가 날개로 오독한 전례가 있다.
    art:
      'a lace parasol blade — an opened white lace parasol with fine gold ribbing and a clean scalloped hem, ' +
      'its slender shaft ending in a polished silver blade tip, a looped ribbon handle, ' +
      'elegant and charming, clearly a parasol-shaped weapon, no text, large, diagonal',
  },

  // ══ 5차 8종 ═════════════════════════════════════════════════════════════════
  // 사용자가 고른 3종(성전 철퇴·육환 석장·보주 홀)이 모두 '자루 + 화려한 상단 헤드'
  // 계열이라 그 형태를 지역만 바꿔 변주한다 — 실루엣이 단순하고 한 손에 들기 좋아
  // 아바타 생성에도 유리한 축이다.
  // ── 웅장 5 ─────────────────────────────────────────────────────────────────
  {
    key: 'kingdom_crown_scepter',
    nameKo: '대관 홀',
    region: '왕국',
    group: '웅장',
    art:
      'a coronation scepter — a long gold rod crowned by a small jeweled crown of arches ' +
      'closing over a deep blue gem, fluted banding down the shaft and a blue silk cord, ' +
      'sovereign and splendid, clearly a scepter weapon, no text, large, diagonal',
  },
  {
    key: 'rune_astral_scepter',
    nameKo: '성좌 홀',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'an astral scepter — a tall dark rod topped by nested brass armillary rings turning around ' +
      'a small white star, faint constellation lines glowing between them, a stone-set collar, ' +
      'cosmic and stately, clearly a scepter weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_serpent_staff',
    nameKo: '뱀 석장',
    region: '늪지대',
    group: '웅장',
    art:
      'a serpent staff — a tall gnarled staff with a green scaled serpent coiled up its length, ' +
      'the head rearing at the top with jade eyes and open fangs, damp bark and a cord grip, ' +
      'sinuous and menacing, clearly a serpent-headed staff weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_dragonhead_staff',
    nameKo: '용두 석장',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a dragonhead staff — a heavy dark staff crowned by a cast bronze dragon head with jaws parted ' +
      'around a glowing molten orb, scaled banding down the shaft and a red cord below, ' +
      'fierce and magnificent, clearly a dragon-headed staff weapon, no text, large, diagonal',
  },
  {
    key: 'orc_totem_staff',
    nameKo: '토템 석장',
    region: '오크 부락',
    group: '웅장',
    art:
      'a totem staff — a thick rough timber staff topped by a carved wooden beast face with bared teeth, ' +
      'painted red and ochre, hung with small bones and feathers-free leather strips, ' +
      'tribal and imposing, clearly a carved totem staff weapon, no text, large, diagonal',
  },

  // ── 코스튬 3 ───────────────────────────────────────────────────────────────
  {
    key: 'temple_crescent_wand',
    nameKo: '초승 완드',
    region: '신전',
    group: '코스튬',
    art:
      'a crescent wand — a short pale rod topped by a slim silver crescent moon holding one small ' +
      'clear gem in its curve, a thin ribbon at the collar, soft pale light along the crescent, ' +
      'serene and pretty, clearly a short magic wand weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_rose_scepter',
    nameKo: '장미 홀',
    region: '왕국',
    group: '코스튬',
    art:
      'a rose scepter — a slim gold rod crowned by a blooming glass rose with translucent pink petals, ' +
      'two small enamel leaves at the collar and a short tassel, ' +
      'refined and lovely, clearly a short scepter weapon, no text, large, diagonal',
  },
  {
    key: 'angel_halo_wand',
    nameKo: '후광 완드',
    region: '타락천사',
    group: '코스튬',
    art:
      'a halo wand — a short white rod topped by a thin floating gold ring haloed in soft light, ' +
      'a small gem suspended at the ring center, a pale ribbon trailing from the collar, ' +
      'radiant and delicate, clearly a short magic wand weapon, no text, large, diagonal',
  },

  // ══ 6차 10종 — 다른 축: 무기 자체가 원소·재질로 빚어진 컨셉 ═══════════════════
  // 앞선 78종은 '무엇으로 생긴 무기'였다면 이쪽은 '무엇으로 만들어진 무기'다.
  // 날 전체가 얼음·불꽃·번개·물·유리·수정으로 이뤄져 재질이 실루엣을 만든다.
  // ── 웅장 6 ─────────────────────────────────────────────────────────────────
  {
    key: 'rune_glacier_greatsword',
    nameKo: '빙하 대검',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a greatsword carved entirely from glacier ice — a wide translucent pale-blue blade with deep ' +
      'internal fractures catching light, frosted edges and a rime-crusted grip of frozen rope, ' +
      'cold and breathtaking, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_flame_blade',
    nameKo: '화염 검',
    region: '화산',
    group: '웅장',
    art:
      'a sword whose blade is living flame — a blackened iron hilt from which a tall tapering blade ' +
      'of bright orange fire rises, its edges licking into sparks, heat shimmer around it, ' +
      'blazing and vivid, clearly a single sword weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_lightning_spear',
    nameKo: '뇌전 창',
    region: '왕국',
    group: '웅장',
    art:
      'a spear whose head is condensed lightning — a gold-banded shaft topped by a jagged bolt of ' +
      'white-blue electricity forming a spearhead, small arcs jumping around the collar, ' +
      'electric and brilliant, clearly a spear polearm weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_thornvine_blade',
    nameKo: '가시덩굴 검',
    region: '늪지대',
    group: '웅장',
    art:
      'a sword grown from living thorn vines — a long blade woven from tight green woody vines ' +
      'with sharp thorns along both edges, small pale buds near the guard, a bark-wrapped grip, ' +
      'wild and alive, clearly a single sword weapon, no text, large, diagonal',
  },
  {
    key: 'orc_shrapnel_cleaver',
    nameKo: '파편 도',
    region: '오크 부락',
    group: '웅장',
    art:
      'a broad blade fused from scrap iron shards — jagged plates and broken blade fragments ' +
      'welded into one heavy chopping edge, glowing weld seams between them, a chain-wrapped grip, ' +
      'ragged and forceful, clearly a broad chopping sword weapon, no text, large, diagonal',
  },
  {
    key: 'angel_radiance_greatsword',
    nameKo: '광휘 대검',
    region: '타락천사',
    group: '웅장',
    art:
      'a greatsword made of solid light — a broad blade of luminous white-gold with a soft glowing ' +
      'aura and faint motes rising from it, a slim ring guard, a grip of woven light, ' +
      'radiant and pure, clearly a greatsword weapon, no text, large, diagonal',
  },

  // ── 코스튬 4 ───────────────────────────────────────────────────────────────
  {
    key: 'temple_stainedglass_blade',
    nameKo: '유리화 검',
    region: '신전',
    group: '코스튬',
    art:
      'a slim sword whose blade is stained glass — panes of rose, amber and blue held in fine lead ' +
      'came forming one clear blade, light passing through in colored beams, a brass collar, ' +
      'luminous and lovely, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_waterflow_blade',
    nameKo: '유수 검',
    region: '늪지대',
    group: '코스튬',
    art:
      'a sword whose blade is flowing water — a smooth curving ribbon of clear blue water rising ' +
      'from a silver hilt, droplets breaking off along its length, a shell-shaped guard, ' +
      'fluid and refreshing, clearly a single curved sword weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_crystal_butterfly',
    nameKo: '수정 나비검',
    region: '왕국',
    group: '코스튬',
    art:
      'a blade formed by one large crystal butterfly — its two faceted wings folded together into ' +
      'a slim translucent blade, thin antennae curling at the guard, a pearl grip, ' +
      'iridescent and delicate, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'angel_nebula_blade',
    nameKo: '성운 검',
    region: '타락천사',
    group: '코스튬',
    art:
      'a slim sword whose blade is a slice of night sky — deep indigo and violet nebula clouds with ' +
      'scattered white stars drifting inside the translucent blade, a small silver crescent guard, ' +
      'dreamy and wondrous, clearly a single slim sword weapon, no text, large, diagonal',
  },

  // ══ 7차 10종 — 또 다른 축: 한국 전통 공예 ════════════════════════════════════
  // 앞선 90종이 전부 서양 판타지 톤이라 대비가 크다. 단청 채색·옻칠·자개 상감·
  // 매듭술·전통 신수로 표면과 장식을 통일한다. 생성기가 못 알아듣는 고유명사
  // (단청·자개 등) 대신 보이는 것으로 풀어 쓴다 — 색·문양·재질.
  // ── 웅장 6 ─────────────────────────────────────────────────────────────────
  {
    key: 'kingdom_dancheong_sabre',
    nameKo: '단청 환도',
    region: '왕국',
    group: '웅장',
    art:
      'an east asian curved sabre — a gently curved bright blade, a round pierced brass guard, ' +
      'a scabbard-style collar painted in red green and cobalt interlocking geometric temple patterns, ' +
      'a braided knot tassel at the pommel, ornate and vivid, clearly a single curved sabre weapon, ' +
      'no text, large, diagonal',
  },
  {
    key: 'westvolcano_chongtong',
    nameKo: '승자총통',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'an old east asian hand cannon — a stout ribbed bronze tube with raised bamboo-like bands, ' +
      'a widened muzzle and a short wooden tail handle, engraved cloud scrollwork, faint smoke, ' +
      'antique and formidable, clearly a bronze hand cannon firearm weapon, no text, large, diagonal',
  },
  {
    key: 'temple_beopgo_drum',
    nameKo: '법고',
    region: '신전',
    group: '웅장',
    art:
      'a large temple war drum on a short pole — a barrel drum with a taut pale hide head, ' +
      'a body painted in red green and gold lotus scroll patterns with brass studs around the rim, ' +
      'a lacquered striking mallet resting against it, resonant and grand, clearly a drum weapon, ' +
      'no text, large, diagonal',
  },
  {
    key: 'rune_horn_bow',
    nameKo: '흑각궁',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a small deeply recurved horn bow — dark polished horn limbs curling sharply back at both tips, ' +
      'wrapped in birch bark with pale sinew binding and a taut string, faint runes along the grip, ' +
      'compact and elegant, clearly a recurve bow weapon, no text, large, diagonal',
  },
  {
    key: 'angel_haetae_greatsword',
    nameKo: '해태 대검',
    region: '타락천사',
    group: '웅장',
    art:
      'a broad ceremonial greatsword — a wide straight blade etched with cloud bands, its guard cast ' +
      'as a maned lion-like guardian beast head with a single horn and bulging eyes, ' +
      'gold and jade fittings, a red knot cord below, austere and majestic, clearly a greatsword weapon, ' +
      'no text, large, diagonal',
  },
  {
    key: 'volcano_bulgasari_club',
    nameKo: '불가사리 곤',
    region: '화산',
    group: '웅장',
    art:
      'a heavy iron war club shaped as a bristling beast — a thick tapering shaft crusted with ' +
      'overlapping iron scales and short spines, a snarling beast head cast at the striking end, ' +
      'glowing red between the scales, monstrous and heavy, clearly an iron war club weapon, ' +
      'no text, large, diagonal',
  },

  // ── 코스튬 4 ───────────────────────────────────────────────────────────────
  {
    key: 'kingdom_gayageum_zither',
    nameKo: '가야금',
    region: '왕국',
    group: '코스튬',
    art:
      'a long east asian zither — a slender curved paulownia board with twelve silk strings ' +
      'over small movable bridges, a mother-of-pearl inlaid crane at one end, a red knot tassel, ' +
      'refined and serene, clearly a long zither instrument weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_long_pipe',
    nameKo: '장죽',
    region: '늪지대',
    group: '코스튬',
    art:
      'a very long smoking pipe — a slim bamboo stem with brass ferrules, a small ornate bowl ' +
      'at one end trailing a thin curl of pale smoke, a jade mouthpiece and a short silk cord, ' +
      'louche and stylish, clearly a long pipe weapon, no text, large, diagonal',
  },
  {
    key: 'orc_gong_cymbal',
    nameKo: '꽹과리',
    region: '오크 부락',
    group: '코스튬',
    art:
      'a small hand gong — a shallow round brass disc with a hammered dimpled face and a rolled rim, ' +
      'a knotted cord grip behind it and a short padded beater, faint ring lines in the air, ' +
      'brash and festive, clearly a hand gong weapon, no text, large, diagonal',
  },
  {
    key: 'angel_ornament_knife',
    nameKo: '은장도',
    region: '타락천사',
    group: '코스튬',
    art:
      'a small ornamental silver knife — a slim blade half drawn from a slender engraved silver sheath ' +
      'inlaid with tiny coral and jade, a long plaited knot tassel hanging from the ring, ' +
      'dainty and precious, clearly a small ornamental knife weapon, no text, large, diagonal',
  },

  // ══ 8차 10종 ═════════════════════════════════════════════════════════════════
  // 앞 배치가 기물·악기 쪽으로 흘러 무기다움이 옅어졌다. 여기서는 정통 판타지
  // 게임 무기의 인상으로 되돌린다 — 검·창·도끼·활·지팡이. 반응이 좋았던 석장과
  // 양산검은 지역을 바꿔 한 종씩 변주한다.
  // ── 석장 · 양산검 변주 2 ───────────────────────────────────────────────────
  {
    key: 'rune_ringstaff_monolith',
    nameKo: '룬환 석장',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a runed ring staff — a tall dark stone shaft crowned by three stacked stone rings that hover ' +
      'apart from each other, pale runes glowing along their inner edges, a carved collar below, ' +
      'ancient and imposing, clearly a ringed staff weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_court_parasol',
    nameKo: '궁정 양산검',
    region: '왕국',
    group: '코스튬',
    art:
      'a court parasol blade — an opened deep blue silk parasol embroidered with gold thread, ' +
      'a scalloped hem hung with small gold beads, its slender shaft ending in a polished blade tip, ' +
      'stately and charming, clearly a parasol-shaped weapon, no text, large, diagonal',
  },

  // ── 정통 판타지 무기 8 ─────────────────────────────────────────────────────
  {
    key: 'kingdom_oath_longsword',
    nameKo: '서약의 성검',
    region: '왕국',
    group: '웅장',
    art:
      'a holy longsword — a straight mirror-bright blade with a glowing blue rune channel down its ' +
      'center, a broad gold crossguard swept upward at the tips, a deep sapphire set in the pommel, ' +
      'noble and radiant, clearly a longsword weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_dragonfire_greatsword',
    nameKo: '용염 대검',
    region: '화산',
    group: '웅장',
    art:
      'a dragonfire greatsword — a massive blade of blackened scaled steel split by glowing molten ' +
      'fissures, a heavy guard cast as spread dragon claws, a smouldering wrapped grip, ' +
      'ferocious and magnificent, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'rune_archmage_staff',
    nameKo: '비전 지팡이',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'an archmage staff — a tall pale shaft crowned by a large faceted violet crystal held in ' +
      'open silver claws, thin glowing rings of arcane script turning slowly around it, ' +
      'scholarly and powerful, clearly a magic staff weapon, no text, large, diagonal',
  },
  {
    key: 'angel_seraph_lance',
    nameKo: '치천 성창',
    region: '타락천사',
    group: '웅장',
    art:
      'a seraph lance — a long slender white-gold lance with a fluted conical vamplate, ' +
      'a narrow spiral head trailing soft golden light, faint halo rings along the shaft, ' +
      'divine and elegant, clearly a lance polearm weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_venom_scimitar',
    nameKo: '독아 곡검',
    region: '늪지대',
    group: '웅장',
    art:
      'a venom scimitar — a deeply curved blade of dark green steel with a serrated inner edge, ' +
      'luminous emerald venom beading along it, a fanged guard and a scaled leather grip, ' +
      'sinister and striking, clearly a curved scimitar sword weapon, no text, large, diagonal',
  },
  {
    key: 'orc_warlord_greataxe',
    nameKo: '파괴자 대부',
    region: '오크 부락',
    group: '웅장',
    art:
      'a warlord greataxe — one enormous crescent axe head of pitted dark iron with red runes ' +
      'burning along the edge, a spiked counterweight and a thick haft bound in studded leather, ' +
      'brutal and commanding, clearly a greataxe weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_drake_longbow',
    nameKo: '화룡 대궁',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a drake longbow — a tall bow carved from pale dragon bone with clawed tips and bronze fittings, ' +
      'its string a taut line of ember light, faint heat rising along the limbs, ' +
      'fearsome and graceful, clearly a longbow weapon, no text, large, diagonal',
  },
  {
    key: 'temple_frost_rapier',
    nameKo: '서릿결 세검',
    region: '신전',
    group: '코스튬',
    art:
      'a frost rapier — a very slender needle-like blade of pale blue steel rimed with fine frost, ' +
      'an ornate swept silver basket hilt shaped from snowflake filigree, a white grip, ' +
      'crisp and refined, clearly a rapier sword weapon, no text, large, diagonal',
  },

  // ══ 9차 10종 — 전부 코스튬, '멋있는' 축 ══════════════════════════════════════
  // 기존 코스튬이 완드·리본·꽃다발처럼 귀여움 쪽에 몰려 있었다. 여기서는 같은
  // 코스튬 축을 시크·날렵 쪽으로 민다 — 검정·은·보석의 절제된 배색, 가늘고
  // 딱 떨어지는 실루엣. 아바타가 들었을 때 그림이 되는 쪽.
  {
    key: 'volcano_lacquer_wakizashi',
    nameKo: '흑칠 소태도',
    region: '화산',
    group: '코스튬',
    art:
      'a short lacquered sidearm sword — a slim bright blade half drawn from a glossy black lacquer ' +
      'scabbard, a small square iron guard and a red silk cord wound tight at the grip, ' +
      'sleek and cool, clearly a short single sword weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_card_fan',
    nameKo: '카드 부채',
    region: '왕국',
    group: '코스튬',
    art:
      'a fan of playing cards held as one weapon — a spread arc of stiff black and gold cards ' +
      'with razor-thin gilded edges, bound at the base by a slim silver clasp, ' +
      'slick and theatrical, clearly a fanned card weapon, no text, large, diagonal',
  },
  {
    key: 'rune_chess_queen_scepter',
    nameKo: '퀸 홀',
    region: '고대 룬 산맥',
    group: '코스튬',
    art:
      'a chess queen scepter — a tall polished obsidian chess queen piece mounted on a slim silver rod, ' +
      'its coronet set with small white gems, faint runes at the base, ' +
      'poised and severe, clearly a scepter weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_rose_sickle',
    nameKo: '흑장미 낫',
    region: '늪지대',
    group: '코스튬',
    art:
      'a small hand sickle — a tight silver crescent blade on a short dark handle, ' +
      'one deep crimson rose bound at the collar with black cord, thorns along the stem, ' +
      'sharp and alluring, clearly a small sickle weapon, no text, large, diagonal',
  },
  {
    key: 'temple_talisman_blade',
    nameKo: '부적검',
    region: '신전',
    group: '코스튬',
    art:
      'a talisman sword — a straight matte grey blade with three narrow paper talisman slips ' +
      'stuck along it fluttering slightly, a plain dark grip and a simple ring guard, ' +
      'austere and striking, clearly a single straight sword weapon, no text, large, diagonal',
  },
  {
    key: 'angel_organpipe_blade',
    nameKo: '파이프 검',
    region: '타락천사',
    group: '코스튬',
    art:
      'an organ pipe blade — a slim sword whose blade is a tight bundle of graduated silver pipes ' +
      'fused into one edge, a small brass stop knob at the guard, soft light between the pipes, ' +
      'stately and unusual, clearly a single slim sword weapon, no text, large, diagonal',
  },
  {
    key: 'orc_tomahawk',
    nameKo: '손도끼',
    region: '오크 부락',
    group: '코스튬',
    art:
      'a light throwing hatchet — a compact crescent steel head on a short straight haft, ' +
      'the haft wrapped in dark cord with one carved bone bead, clean bright edge, ' +
      'lean and rakish, clearly a small hatchet axe weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_lace_claw',
    nameKo: '레이스 클로',
    region: '왕국',
    group: '코스튬',
    art:
      'a lace glove claw — a fitted black lace glove ending in three slim polished silver talons ' +
      'over the fingertips, a pearl button at the wrist and fine chain across the back of the hand, ' +
      'chic and dangerous, clearly a clawed glove weapon, no text, large, diagonal',
  },
  {
    key: 'rune_arcane_cube',
    nameKo: '비전 정육면체',
    region: '고대 룬 산맥',
    group: '코스튬',
    art:
      'an arcane cube — a small floating black cube with its faces split open along glowing violet ' +
      'seams, thin silver plates hovering slightly apart from the core, ' +
      'enigmatic and sharp, clearly a floating cube weapon, no text, large, diagonal',
  },
  {
    key: 'angel_masquerade_blade',
    nameKo: '가면검',
    region: '타락천사',
    group: '코스튬',
    art:
      'a masquerade sword — a slender bright blade whose guard is a white porcelain half mask ' +
      'with gilded eye rims, a black satin ribbon trailing from one side, a slim dark grip, ' +
      'mysterious and elegant, clearly a single slim sword weapon, no text, large, diagonal',
  },

  // ══ 10차 10종 — 평범한 무기 + 포인트 하나 ════════════════════════════════════
  // 8차는 판타지 클리셰(빛나는 룬·용암 균열·부유 수정)를 쌓기만 해 인상이 없었고,
  // 9차는 물건 자체가 기이해 무기가 아니라 소품이 됐다. 확정 정본인 킨츠기 카타나가
  // '평범한 카타나 + 부러졌다 금으로 이어붙임' 하나로 성립하는 구조라 그 문법을 쓴다.
  // 형태는 누구나 아는 무기 그대로 두고, 기억에 남는 요소는 딱 하나만 얹는다.
  // ── 웅장 6 ─────────────────────────────────────────────────────────────────
  {
    key: 'kingdom_flamberge',
    nameKo: '물결 대검',
    region: '왕국',
    group: '웅장',
    art:
      'a two-handed greatsword whose long steel blade waves in smooth undulating curves from guard ' +
      'to tip like a frozen ripple, plain steel crossguard and leather grip, ' +
      'restrained and striking, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'rune_geode_spear',
    nameKo: '원석 창',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a long spear with a plain dark wooden shaft, its head a single rough uncut amethyst geode ' +
      'lashed on with cord, raw violet crystals bristling where the stone is broken open, ' +
      'crude and beautiful, clearly a spear polearm weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_antler_bow',
    nameKo: '사슴뿔 활',
    region: '늪지대',
    group: '웅장',
    art:
      'a hunting bow whose two limbs are a matched pair of pale branching stag antlers, ' +
      'joined at a simple wrapped grip with a taut dark string, ' +
      'quiet and wild, clearly a bow weapon, no text, large, diagonal',
  },
  {
    key: 'angel_sealed_greatsword',
    nameKo: '봉인 대검',
    region: '타락천사',
    group: '웅장',
    art:
      'a plain broad greatsword of grey steel with three heavy old padlocks clasped shut across ' +
      'the flat of the blade, their shackles biting into the metal, a worn wrapped grip, ' +
      'grim and arresting, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_sand_greatsword',
    nameKo: '모래 대검',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a straight greatsword of dark steel whose upper half is dissolving into streaming pale sand, ' +
      'grains peeling off the edge and drifting away, the lower half still solid, ' +
      'melancholy and dramatic, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'orc_scepter_axe',
    nameKo: '부러진 홀 도끼',
    region: '오크 부락',
    group: '웅장',
    art:
      'a heavy iron war axe whose haft is a looted royal gold scepter snapped short, ' +
      'its jeweled finial still on the butt end, the crude axe head lashed on with rawhide, ' +
      'insolent and brutal, clearly a war axe weapon, no text, large, diagonal',
  },

  // ── 코스튬 4 ───────────────────────────────────────────────────────────────
  {
    key: 'volcano_petal_katana',
    nameKo: '벚꽃 태도',
    region: '화산',
    group: '코스튬',
    art:
      'a slim katana in a plain matte black scabbard, a few pale pink cherry blossom petals ' +
      'caught against the lacquer near the mouth, simple dark cord wrap on the hilt, ' +
      'quiet and lovely, clearly a katana sword weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_ivy_rapier',
    nameKo: '담쟁이 세검',
    region: '늪지대',
    group: '코스튬',
    art:
      'a slender rapier with a simple swept steel guard, one living ivy vine spiralling up the blade ' +
      'from the hilt with small green leaves, the bright edge still clear above it, ' +
      'gentle and elegant, clearly a rapier sword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_ice_sheath_dagger',
    nameKo: '얼음집 단검',
    region: '신전',
    group: '코스튬',
    art:
      'a plain silver dagger half drawn from a sheath made of clear ice, ' +
      'the ice beaded with meltwater and one drop falling from its tip, a simple white grip, ' +
      'cool and delicate, clearly a single dagger weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_oathring_sword',
    nameKo: '서약 반지 검',
    region: '왕국',
    group: '코스튬',
    art:
      'a slim plain longsword with a narrow steel crossguard, a single gold ring hanging from ' +
      'the pommel on a short fine chain, nothing else adorning it, ' +
      'spare and sentimental, clearly a longsword weapon, no text, large, diagonal',
  },

  // ══ 11차 10종 — 화려·아름다움·웅장 ═══════════════════════════════════════════
  // 10차는 포인트를 살리려 나머지를 눌렀더니 화려함까지 죽었고, 8·9차는 반대로
  // 디테일을 나열해 생성기 재량을 없앴다. items-v2에서 검증된 규칙으로 돌아간다 —
  // 핵심 형태와 컨셉 한 줄만 주고 장식은 "화려하게"로 맡길수록 결과가 좋다.
  // 프롬프트를 짧게 유지하는 것이 이 배치의 핵심이다.
  // ── 웅장 6 ─────────────────────────────────────────────────────────────────
  {
    key: 'kingdom_coronation_greatsword',
    nameKo: '대관 대검',
    region: '왕국',
    group: '웅장',
    art:
      'a coronation greatsword — a broad ceremonial blade of the royal house, gold and deep sapphire, ' +
      'magnificently ornate, breathtaking and regal, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_dawn_spear',
    nameKo: '여명의 창',
    region: '신전',
    group: '웅장',
    art:
      'a dawn spear — a tall temple spear crowned in sunrise gold, warm light spilling down the shaft, ' +
      'gloriously ornate, radiant and beautiful, clearly a spear polearm weapon, no text, large, diagonal',
  },
  {
    key: 'angel_mandorla_greatsword',
    nameKo: '광배 대검',
    region: '타락천사',
    group: '웅장',
    art:
      'a mandorla greatsword — a white and gold blade standing before a great radiant halo disc, ' +
      'richly decorated, divine and awe-inspiring, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_phoenix_sabre',
    nameKo: '불사조 곡도',
    region: '화산',
    group: '웅장',
    art:
      'a phoenix sabre — a long curved blade wreathed in rising crimson and gold fire, ' +
      'lavishly ornate, blazing and beautiful, clearly a curved sabre sword weapon, no text, large, diagonal',
  },
  {
    key: 'rune_constellation_longbow',
    nameKo: '성좌 대궁',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a constellation longbow — a tall bow inlaid with silver star maps, faint starlight along its limbs, ' +
      'exquisitely ornate, serene and majestic, clearly a longbow weapon, no text, large, diagonal',
  },
  {
    key: 'westvolcano_dragonscale_greataxe',
    nameKo: '용린 대부',
    region: '서쪽 화산',
    group: '웅장',
    art:
      'a dragonscale greataxe — a huge axe sheathed in iridescent dragon scales, gold fittings, ' +
      'opulently ornate, fearsome and splendid, clearly a greataxe weapon, no text, large, diagonal',
  },

  // ── 코스튬 4 ───────────────────────────────────────────────────────────────
  {
    key: 'kingdom_rosewindow_rapier',
    nameKo: '장미창 세검',
    region: '왕국',
    group: '코스튬',
    art:
      'a rose window rapier — a slender blade whose guard is a jewel-toned cathedral rose window, ' +
      'delicately ornate, luminous and beautiful, clearly a rapier sword weapon, no text, large, diagonal',
  },
  {
    key: 'temple_brocade_fan',
    nameKo: '금란 합죽선',
    region: '신전',
    group: '코스튬',
    art:
      'a brocade war fan — an opened folding fan of gold-woven silk with lacquered ribs, ' +
      'sumptuously ornate, graceful and beautiful, clearly a folding war fan weapon, no text, large, diagonal',
  },
  {
    key: 'angel_cathedral_parasol',
    nameKo: '대성당 양산',
    region: '타락천사',
    group: '코스튬',
    art:
      'a cathedral parasol blade — an opened parasol canopied in stained glass panes, ' +
      'a slim blade at its tip, gorgeously ornate, jewel-bright and beautiful, ' +
      'clearly a parasol-shaped weapon, no text, large, diagonal',
  },
  {
    key: 'swamp_nacre_scimitar',
    nameKo: '진주모 곡검',
    region: '늪지대',
    group: '코스튬',
    art:
      'a nacre scimitar — a curved blade shimmering with mother-of-pearl iridescence, pale and rose, ' +
      'finely ornate, elegant and beautiful, clearly a curved scimitar sword weapon, no text, large, diagonal',
  },

  // ══ 12차 10종 — 강화의 흔적 ══════════════════════════════════════════════════
  // 8~11차가 연달아 빗나간 원인은 형용사가 아니라 축이었다. 기존 40종이 이미
  // '아름답고 화려한 판타지 가챠 무기'라 화려하게 만들수록 그 무리에 섞이고,
  // 특이하게 만들면 무기가 아니라 소품이 됐다.
  //
  // 이 게임에만 있는 축은 강화다. 확정 정본인 킨츠기 카타나가 살아남은 이유도
  // 화려해서가 아니라 '부러졌다 금으로 이어붙여진' 무기이기 때문이다 — 강화
  // 게임의 무기가 강화의 흔적을 몸에 지녔다. 기존 40종에 이 축은 킨츠기 하나뿐이라
  // 차별점도 분명하다. 겹쳐 벼린 층·이어붙인 조각·덧댄 판·되감은 자루로 푼다.
  // 프롬프트는 11차처럼 짧게 — 구조 아이디어 하나만 주고 장식은 맡긴다.
  // ── 웅장 6 ─────────────────────────────────────────────────────────────────
  {
    key: 'kingdom_manyblade_greatsword',
    nameKo: '백검 대검',
    region: '왕국',
    group: '웅장',
    art:
      'a greatsword forged from many broken swords fused into one blade, every seam still visible ' +
      'and filled with bright gold, magnificently ornate, clearly a greatsword weapon, no text, large, diagonal',
  },
  {
    key: 'volcano_foldsteel_odachi',
    nameKo: '접쇠 대태도',
    region: '화산',
    group: '웅장',
    art:
      'a very long odachi whose steel shows hundreds of folded layers rippling down the blade like ' +
      'flowing grain, glowing faintly between the folds, splendid, clearly a long katana sword weapon, ' +
      'no text, large, diagonal',
  },
  {
    key: 'orc_layered_greataxe',
    nameKo: '겹판 대부',
    region: '오크 부락',
    group: '웅장',
    art:
      'a greataxe whose head is built from iron plates hammered on one over another over years, ' +
      'stacked in visible stepped layers, rugged and imposing, clearly a greataxe weapon, ' +
      'no text, large, diagonal',
  },
  {
    key: 'temple_kintsugi_mace',
    nameKo: '금계 철퇴',
    region: '신전',
    group: '웅장',
    art:
      'a temple mace whose heavy head was once shattered and rejoined, molten gold branching through ' +
      'every crack, sacred and magnificent, clearly a mace weapon, no text, large, diagonal',
  },
  {
    key: 'angel_shard_lance',
    nameKo: '파편 성창',
    region: '타락천사',
    group: '웅장',
    art:
      'a lance broken into many pieces and held together in mid-air by threads of golden light, ' +
      'the shards hovering slightly apart, divine and breathtaking, clearly a lance polearm weapon, ' +
      'no text, large, diagonal',
  },
  {
    key: 'rune_grown_greatsword',
    nameKo: '결정 대검',
    region: '고대 룬 산맥',
    group: '웅장',
    art:
      'a greatsword whose original steel blade is half swallowed by violet crystal grown outward ' +
      'from it, the crystal now longer than the steel, majestic, clearly a greatsword weapon, ' +
      'no text, large, diagonal',
  },

  // ── 코스튬 4 ───────────────────────────────────────────────────────────────
  {
    key: 'swamp_regrown_staff',
    nameKo: '되살아난 지팡이',
    region: '늪지대',
    group: '코스튬',
    art:
      'a slim wooden staff snapped in the middle, a fresh green branch grown across the break ' +
      'and flowering there, gentle and beautiful, clearly a wooden staff weapon, no text, large, diagonal',
  },
  {
    key: 'kingdom_goldwound_rapier',
    nameKo: '금선 세검',
    region: '왕국',
    group: '코스튬',
    art:
      'a slender rapier whose blade carries many old nicks and cracks, every one filled in with ' +
      'fine gold, elegant and beautiful, clearly a rapier sword weapon, no text, large, diagonal',
  },
  {
    key: 'angel_rewound_bow',
    nameKo: '되감은 활',
    region: '타락천사',
    group: '코스튬',
    art:
      'a slim bow once broken at the grip, bound back together with thousands of turns of gold thread ' +
      'swelling at the mend, graceful and lovely, clearly a bow weapon, no text, large, diagonal',
  },
  {
    key: 'temple_strata_scepter',
    nameKo: '층계 홀',
    region: '신전',
    group: '코스튬',
    art:
      'a short scepter whose head is many small ornate crowns added one atop another over generations, ' +
      'each a different metal, precious and ornate, clearly a scepter weapon, no text, large, diagonal',
  },
];

/** 생성한 객체 id 기록 — 애니는 만든 키로만 가능하므로 키 라벨을 함께 남긴다. */
function rememberObject(itemKey: string, objectId: string): void {
  let m: Record<string, { key: string; objectId: string }> = {};
  try {
    if (existsSync(MAP_PATH)) m = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  } catch {
    m = {};
  }
  m[itemKey] = { key: 'key1', objectId };
  writeFileSync(MAP_PATH, JSON.stringify(m, null, 2) + '\n');
}

/** rotation_urls / frame_urls 등에서 첫 유효 URL(gen-items.ts와 동일). */
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

async function genOne(c: Cand): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(OUT_DIR, `${c.key}.png`);
  if (existsSync(out)) return 'skip';

  // 1) 객체 생성 요청
  let objectId = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PIX}/create-1-direction-object`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: `${c.art}, ${TAIL}`,
          size: SIZE,
          view: 'sidescroller', // 측면 아이콘 — 기존 120종과 동일
        }),
      });
    } catch (e) {
      console.error(`  ${c.key} 네트워크 — 재시도: ${(e as Error).message}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429) {
      const wait = 3000 * 2 ** attempt;
      console.error(`  ${c.key} 429 → ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      console.error(`  ${c.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return 'fail';
    }
    const j = (await res.json()) as { object_id?: string };
    objectId = j.object_id ?? '';
    if (objectId) rememberObject(c.key, objectId); // 즉시 기록 — 애니의 유일한 연결고리
    break;
  }
  if (!objectId) return 'fail';

  // 2) 완료 폴링(객체는 가끔 3분 넘김)
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response;
    try {
      g = await fetch(`${PIX}/objects/${objectId}`, { headers: { authorization: `Bearer ${KEY}` } });
    } catch {
      continue;
    }
    if (!g.ok) continue;
    const gj = (await g.json()) as {
      status?: string;
      rotation_urls?: unknown;
      frame_urls?: unknown;
      storage_urls?: unknown;
    };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) {
        console.error(`  ${c.key} ${gj.status}인데 이미지 URL 없음`);
        return 'fail';
      }
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${c.key} PNG 아님`);
        return 'fail';
      }
      writeFileSync(out, buf);
      return 'ok';
    }
    if (gj.status === 'failed') {
      console.error(`  ${c.key} 객체 생성 실패`);
      return 'fail';
    }
  }
  console.error(`  ${c.key} 폴링 타임아웃(객체 id는 기록됨: ${objectId})`);
  return 'fail';
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const list = only ? CANDIDATES.filter((c) => only.includes(c.key)) : CANDIDATES;

  console.log(`무기 후보 ${list.length}종 — Pixellab 객체(sidescroller, ${SIZE}px, key1)\n`);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const c of list) {
    // 동시성 1 — 429 회피(스프라이트 파이프라인 관례).
    const r = await genOne(c);
    if (r === 'ok') {
      ok += 1;
      console.log(`  ✓ [${c.group}] ${c.key.padEnd(28)} ${c.nameKo}`);
    } else if (r === 'skip') {
      skip += 1;
      console.log(`  · [${c.group}] ${c.key.padEnd(28)} (이미 있음)`);
    } else {
      fail += 1;
    }
  }
  console.log(`\n완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

void main();

export { CANDIDATES };
export type { Cand };
