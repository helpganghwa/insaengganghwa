/**
 * 아바타 검증을 통과한 최종 7종 — 이름 제안 · 애니메이션 프롬프트.
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

export const FINAL_7: FinalItem[] = [
  {
    key: 'temple_ringstaff_khakkhara',
    nameWork: '육환 석장',
    nameProposal: '길을 비우는 석장',
    nameWhy: '고리 소리를 앞세워 보내면 풀숲의 작은 것들이 먼저 길을 비킨다',
    anim:
      'the pilgrim staff stays completely fixed and motionless; only the loose gold rings at its ' +
      'head sway and chime gently while a warm gold light breathes through the finial',
  },
  {
    key: 'volcano_flame_blade',
    nameWork: '화염 검',
    nameProposal: '놓을 곳 없는 불검',
    nameWhy: '칼집이 들어갈 자리가 없어 세워 둘 수도 허리에 찰 수도 없다',
    anim:
      'the dark iron hilt stays completely fixed and motionless while the blade of living flame ' +
      'flickers and licks upward, orange sparks rising and heat-shimmer breathing around it',
  },
  {
    key: 'swamp_antler_bow',
    nameWork: '사슴뿔 활',
    nameProposal: '뿔이 자란 활',
    nameWhy: '활대 두 짝이 사슴뿔 그대로라 잔가지 사이에서 시위 걸 자리를 찾아야 한다',
    anim:
      'the antler bow stays completely fixed and rigid; only the dark bowstring hums and vibrates ' +
      'once while a faint pale-green glow breathes along the bone antlers',
  },
  {
    key: 'druid_antler_staff',
    nameWork: '드루이드의 지팡이',
    nameProposal: '여름을 가둔 지팡이',
    nameWhy: '호박석 안에 오래된 여름이 통째로 갇혀 겨울에 짚으면 손끝부터 데워진다',
    anim:
      'the antler staff stays completely fixed and motionless; only the amber stone in its fork ' +
      'glows warmer and dimmer while the green moss and vine leaves stir softly',
  },
  {
    key: 'oni_slayer_odachi',
    nameWork: '귀참의 대태도',
    nameProposal: '먼저 웃는 대도',
    nameWhy: '뽑는 순간 코등이의 도깨비 얼굴이 먼저 이를 드러내며 웃는다',
    anim:
      'the odachi stays completely fixed and rigid; only the crimson flame patterns flow and ' +
      "brighten along the black blade while the oni face's eyes flare red",
  },
  {
    key: 'druid_thorn_staff',
    nameWork: '가시 드루이드 지팡이',
    nameProposal: '장미 핀 가시 지팡이',
    nameWhy: '쥔 자리마다 손바닥이 찢기는데도 다들 가시가 아니라 꽃 쪽만 본다',
    anim:
      'the bramble staff stays completely fixed and motionless; only the deep red rose at its ' +
      'crown breathes open and closed while a faint crimson glow pulses among the thorns',
  },
  {
    key: 'angel_orb_scepter',
    nameWork: '보주 홀',
    nameProposal: '고리가 도는 홀',
    nameWhy: '얇은 고리가 보주 둘레를 쉬지 않고 돌아, 오래 들면 손목이 그 속도를 따라간다',
    anim:
      'the gold wand stays completely fixed and motionless; only the thin gold ring turns slowly ' +
      'around the pearl-white orb while the orb glows brighter and dimmer and the tasseled cords sway',
  },
];
