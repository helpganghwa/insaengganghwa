/**
 * 아바타 검증을 통과한 최종 6종 — 이름 제안 · 애니메이션 프롬프트.
 *
 * 로어·wornDesc는 weapon-cand-data.ts가 정본이라 여기서 다시 쓰지 않는다(키로 참조).
 *
 * **이름**: 후보 단계의 이름은 형태를 설명하는 작업용이었다("화염 검", "드루이드의 지팡이").
 * 기존 카탈로그는 그렇게 짓지 않는다 — "마녀의 등불", "노을이 앉는 검", "초혼의 해골장"처럼
 * 로어의 한 대목을 이름으로 삼아 여운을 남긴다. 그 문법에 맞춰 다시 제안한다(리뷰 대상).
 *
 * **애니메이션**: anim3 정본 규칙 — 본체는 완전히 정지, 부속물·오라·자연요소만 움직인다.
 * 본체를 움직이면 픽셀이 흔들려 무기가 뭉개진다(기존 77종에서 확립).
 */
export type FinalItem = {
  key: string;
  /** 후보 단계의 작업용 이름. */
  nameWork: string;
  /** 카탈로그 등재용 제안 — 리뷰 후 확정. */
  nameProposal: string;
  /** 이 이름을 고른 이유(로어의 어느 대목인지). */
  nameWhy: string;
  /** anim3-prompts.json에 넣을 값. */
  anim: string;
};

export const FINAL_6: FinalItem[] = [
  {
    key: 'temple_ringstaff_khakkhara',
    nameWork: '육환 석장',
    nameProposal: '육환 석장',
    nameWhy: '여섯 고리가 그대로 이름이 된다 — 현행 이름 유지(사용자 확정)',
    anim:
      'the pilgrim staff stays completely fixed and motionless; only the loose gold rings at its ' +
      'head sway and chime gently while a warm gold light breathes through the finial',
  },
  {
    key: 'volcano_flame_blade',
    nameWork: '화염 검',
    nameProposal: '놓을 곳 없는 화염검',
    nameWhy: '칼집이 들어갈 자리가 없어 세워 둘 수도 허리에 찰 수도 없다',
    anim:
      'the dark iron hilt stays completely fixed and motionless while the blade of living flame ' +
      'flickers and licks upward, orange sparks rising and heat-shimmer breathing around it',
  },
  {
    key: 'swamp_antler_bow',
    nameWork: '사슴뿔 활',
    nameProposal: '사슴뿔 활',
    nameWhy: '활대 두 짝이 사슴뿔 그대로다 — 현행 이름 유지(사용자 확정)',
    anim:
      "the antler bow is completely fixed, rigid and motionless — it does not move, rotate, sway or" +
      " shift at all; only a soft pale light travels slowly up along the bone antlers from the grip" +
      " to the tips and fades"
  },
  {
    key: 'druid_antler_staff',
    nameWork: '드루이드의 지팡이',
    nameProposal: '드루이드의 지팡이',
    nameWhy: '현행 이름 유지(사용자 확정)',
    anim:
      'the antler staff stays completely fixed and motionless; only the amber stone in its fork ' +
      'glows warmer and dimmer while the green moss and vine leaves stir softly',
  },
  {
    key: 'oni_slayer_odachi',
    nameWork: '귀참의 대태도',
    nameProposal: '귀참의 대태도',
    nameWhy: '현행 이름 유지(사용자 확정)',
    anim:
      "the odachi is completely fixed, rigid and motionless — the blade does not move, rotate, sway" +
      " or shift at all; a deep crimson aura pulses and breathes outward around the whole sword wit" +
      "h faint ember motes drifting up through it, while the flame pattern on the black blade glows" +
      " softly within"
  },
  {
    key: 'druid_thorn_staff',
    nameWork: '가시 드루이드 지팡이',
    nameProposal: '장미 핀 가시 지팡이',
    nameWhy: '쥔 자리마다 손바닥이 찢기는데도 다들 가시가 아니라 꽃 쪽만 본다',
    anim:
      "the bramble staff is completely fixed, rigid and motionless — the shaft does not move, sway " +
      "or shift at all; only the deep red rose at its crown slowly unfurls petal by petal into full" +
      " bloom"
  },
];
