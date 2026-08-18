/**
 * 무기 종류 정본(2026-08-06) — 아바타 프롬프트가 "이게 무슨 무기인지"를 잃지 않게 하는 앵커.
 *
 * 배경: compose-v3는 스프라이트 이미지를 1차 근거로 삼는데, 날개꼴 칼(한 쌍의 깃)이나 활대가
 * 큰 석궁(봄을 겨눈 석궁)처럼 **실루엣이 다른 물건으로 읽히는** 아이템에서 최종 프롬프트에
 * 종류 명사가 한 번도 등장하지 않아 생성기가 날개·활을 그렸다(프로덕션 실측). 종류 확정 문구는
 * art에만 있었고 art는 compose 입력에서 제외된다(색·서사 모순 노이즈 차단 목적).
 *
 * 그래서 종류를 **키 기준 단일 사전**으로 못 박고, compose가 이를 프롬프트에 강제로 싣는다.
 * 신규 무기 추가 시 여기에 한 줄 넣는다 — 누락되면 접미사 추론으로 폴백한다.
 */

export type WeaponKind = {
  /**
   * 최종 프롬프트에 반드시 등장해야 하는 영문 종류 명사.
   *
   * ⚠ 괄호 보충은 **어휘가 모호할 때 범주를 알려주는 용도로만** 쓴다(odachi·blowgun·cane sword
   * 처럼 단어만으로는 무엇인지 모르는 경우). 재질·형태 형용사를 넣으면 아이템 고유의 실루엣을
   * 지운다 — 'metal-bladed'를 넣었더니 날개꼴 칼이 평범한 칼이 됐다(2026-08-06 제보).
   * 형태를 꼭 지켜야 하는 아이템은 형태를 **명사 안에 긍정형으로** 남긴다.
   */
  noun: string;
  /** 양손에 하나씩 드는 한 쌍 — '지팡이처럼 짚기' 류 한 자루 포즈와 상충한다. */
  pair?: boolean;
  /** 원거리 — 해부 어휘(stock·trigger·string)와 수평 파지 포즈가 필요하다. */
  ranged?: boolean;
};

/** 키 → 종류. nameKo·wornDesc·스프라이트를 대조해 확정(2026-08-06). */
const BY_KEY: Record<string, WeaponKind> = {
  // ── 한손검·도 ──
  kingdom_ribbon_rapier: { noun: 'rapier (a slender one-handed sword)' },
  vampire_blood_rapier: { noun: 'rapier (a slender one-handed sword)' },
  kingdom_masque_saber: { noun: 'saber (a curved one-handed sword)' },
  kingdom_winged_coronation_sword: { noun: 'longsword' },
  kingdom_dawnguard_sword: { noun: 'longsword' },
  angel_duskwing_sword: { noun: 'longsword' },
  general_starfield_blade: { noun: 'longsword' },
  kingdom_falcon_cane_sword: { noun: 'cane sword (a slim sword with a cane-like hilt)' },
  general_kintsugi_katana: { noun: 'katana (a curved Japanese sword)' },
  temple_frost_odachi: { noun: 'odachi (a very long two-handed Japanese sword)' },
  // ── 대검 ──
  volcano_emberveined_greatsword: { noun: 'greatsword' },
  celestial_dawn_greatsword: { noun: 'greatsword' },
  vault_key_greatsword: { noun: 'greatsword' },
  kingdom_coronation_mace: { noun: 'greatsword' }, // 키는 mace지만 실물은 대검(wornDesc·스프라이트 기준)
  fallen_half_blade: { noun: 'greatsword' },
  // ── 장병기 ──
  swamp_lotus_trident: { noun: 'trident (a three-pronged polearm)' },
  volcano_dragonjaw_halberd: { noun: 'halberd (a polearm)' },
  kingdom_banner_spear: { noun: 'spear (a polearm)' },
  thunder_emperor_spear: { noun: 'spear (a polearm)' },
  general_spiral_lance: { noun: 'jousting lance (one long tapering cone)' },
  volcano_ember_scythe: { noun: 'scythe (a polearm)' },
  reaper_soul_scythe: { noun: 'scythe (a polearm)' },
  // ── 둔기·지팡이 ──
  volcano_forgeheart_warhammer: { noun: 'warhammer' },
  angel_star_wand: { noun: 'wand (a short magic rod)' },
  pumpkin_witch_staff: { noun: 'staff (a long magic rod)' },
  necromancer_skull_staff: { noun: 'staff (a long magic rod)' },
  orc_shaman_staff: { noun: 'staff (a long magic rod)' },
  // ── 쌍무기 ──
  kingdom_court_twin_sabers: { noun: 'twin sabers', pair: true }, // 실물은 곧은 날 — '굽은' 보충은 모순이라 제거
  assassin_twin_daggers: { noun: 'twin daggers', pair: true },
  volcano_dancer_daggers: { noun: 'twin daggers', pair: true },
  // 날개꼴 칼 — 스프라이트가 깃털 날개로 읽혀 생성기가 등에 날개를 그렸다. 종류(검)는 못 박되
  // **형태(깃털 날개꼴 칼날)는 명사 안에 남긴다** — 'metal-bladed'만 강조했더니 평범한 칼로
  // 변해 아이템 정체성이 사라졌다(2026-08-06 제보).
  fallen_pinion_twinblades: { noun: 'twin swords, each blade a long feathered wing of metal', pair: true },
  // ── 원거리 ──
  temple_frostward_bow: { noun: 'crossbow (a horizontal stock with a trigger)', ranged: true }, // 키는 bow지만 석궁
  angel_cherub_bow: { noun: 'archery bow', ranged: true },
  volcano_phoenix_bow: { noun: 'archery bow', ranged: true },
  temple_icicle_longbow: { noun: 'longbow', ranged: true },
  fallen_grace_greatbow: { noun: 'greatbow whose two limbs are feathered wings', ranged: true },
  ivory_flintlock_pistol: { noun: 'flintlock pistol', ranged: true },
  general_twin_flintlocks: { noun: 'twin flintlock pistols', pair: true, ranged: true },
  marsh_frog_blowgun: { noun: 'blowgun (a long tube)', ranged: true },
  orc_hunter_boomerang: { noun: 'boomerang (a curved throwing blade held in one hand)' },

  // ── 교체 후보 14종(아바타 생성 검증 중) ──
  // 아직 카탈로그 미등재라 프로덕션에서는 조회되지 않는다 — 검증 스크립트가 쓰고,
  // 채택 시 그대로 정본이 된다. 양산·활·조종대처럼 실루엣이 무기로 안 읽히는 것은
  // 괄호로 범주를 못 박는다(위 ⚠ 규칙: 재질·형태 형용사는 넣지 않는다).
  kingdom_lionheart_axe: { noun: 'battle axe' },
  temple_sanctus_mace: { noun: 'mace' },
  // ⚠ 'umbrella'라고 쓰면 생성기가 우산만 그리고 무기로 안 읽는다(2026-08-18 실측).
  //   양산은 배경이고 무기는 자루 끝의 창날이라, 명사 안에 그 창날을 남긴다.
  angel_lace_parasol: { noun: 'parasol blade (a parasol whose shaft ends in a spear blade)' },
  temple_ringstaff_khakkhara: { noun: 'khakkhara (a tall ringed monk staff)' },
  // scepter라고 하면 계속 장대처럼 길어진다(2026-08-18 2회 실측) — 종류를 wand로 바꾼다.
  // 기존 angel_star_wand가 같은 명사로 짧게 잘 나온다.
  angel_orb_scepter: { noun: 'wand (a short magic rod)' },
  volcano_flame_blade: { noun: 'sword' },
  swamp_antler_bow: { noun: 'archery bow', ranged: true },
  westvolcano_dragonscale_greataxe: { noun: 'greataxe' },
  kingdom_goldwound_rapier: { noun: 'rapier (a slender one-handed sword)' },
  plague_doctor_cane: { noun: 'cane staff (a tall walking-stick staff)' },
  druid_antler_staff: { noun: 'staff (a long magic rod)' },
  puppeteer_thread_claw: { noun: 'puppet control bar (a cross-shaped handle with hanging threads)' },
  oni_slayer_odachi: { noun: 'odachi (a very long two-handed Japanese sword)' },
  druid_thorn_staff: { noun: 'staff (a long magic rod)' },
};

/** 접미사 폴백 — 사전 누락분이 종류 없이 나가지 않게 한다. */
const BY_SUFFIX: Record<string, WeaponKind> = {
  rapier: { noun: 'rapier (a slender one-handed sword)' },
  saber: { noun: 'saber (a curved one-handed sword)' },
  sabers: { noun: 'twin sabers', pair: true },
  sword: { noun: 'longsword' },
  blade: { noun: 'longsword' },
  katana: { noun: 'katana (a curved Japanese sword)' },
  odachi: { noun: 'odachi (a very long two-handed Japanese sword)' },
  greatsword: { noun: 'greatsword' },
  twinblades: { noun: 'twin swords', pair: true },
  daggers: { noun: 'twin daggers', pair: true },
  trident: { noun: 'trident (a three-pronged polearm)' },
  halberd: { noun: 'halberd (a polearm)' },
  spear: { noun: 'spear (a polearm)' },
  lance: { noun: 'lance (a polearm)' },
  scythe: { noun: 'scythe (a polearm)' },
  warhammer: { noun: 'warhammer' },
  mace: { noun: 'mace' },
  wand: { noun: 'wand (a short magic rod)' },
  staff: { noun: 'staff (a long magic rod)' },
  bow: { noun: 'archery bow', ranged: true },
  longbow: { noun: 'longbow', ranged: true },
  greatbow: { noun: 'greatbow (a very large archery bow)', ranged: true },
  crossbow: { noun: 'crossbow (a horizontal stock with a trigger)', ranged: true },
  pistol: { noun: 'flintlock pistol', ranged: true },
  flintlocks: { noun: 'twin flintlock pistols', pair: true, ranged: true },
  blowgun: { noun: 'blowgun (a long tube)', ranged: true },
  boomerang: { noun: 'boomerang (a curved throwing blade held in one hand)' },
};

/** 무기 키 → 종류. 사전에 없으면 접미사 추론, 그마저 없으면 null(종류 앵커 생략). */
export function weaponKindOf(key: string | null | undefined): WeaponKind | null {
  if (!key) return null;
  const exact = BY_KEY[key];
  if (exact) return exact;
  return BY_SUFFIX[key.split('_').pop() ?? ''] ?? null;
}
