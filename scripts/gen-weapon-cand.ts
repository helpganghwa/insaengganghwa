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
