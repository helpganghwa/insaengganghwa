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
    nameProposal: '길을 비우는 소리',
    nameWhy: '고리 소리를 듣고 작은 것들이 먼저 비켜난다 — 밟지 않으려고 내는 소리',
    anim:
      'the pilgrim staff stays completely fixed and motionless; only the loose gold rings at its ' +
      'head sway and chime gently while a warm gold light breathes through the finial',
  },
  {
    key: 'volcano_flame_blade',
    nameWork: '화염 검',
    nameProposal: '놓을 곳 없는 검',
    nameWhy: '칼집이 없어 벽에 세워 둘 수도 없다 — 주인은 늘 무언가를 든 사람으로 기억된다',
    anim:
      'the dark iron hilt stays completely fixed and motionless while the blade of living flame ' +
      'flickers and licks upward, orange sparks rising and heat-shimmer breathing around it',
  },
  {
    key: 'swamp_antler_bow',
    nameWork: '사슴뿔 활',
    nameProposal: '인사가 긴 활',
    nameWhy: '시위 걸 자리를 찾는 데 한참 걸린다 — 사냥꾼은 그걸 뿔의 주인에게 인사하는 시간이라 했다',
    anim:
      'the antler bow stays completely fixed and rigid; only the dark bowstring hums and vibrates ' +
      'once while a faint pale-green glow breathes along the bone antlers',
  },
  {
    key: 'druid_antler_staff',
    nameWork: '드루이드의 지팡이',
    nameProposal: '갇힌 여름',
    nameWhy: '호박석 안에 아주 오래된 여름이 갇혀 있다 — 겨울에 들면 손끝부터 따뜻해진다',
    anim:
      'the antler staff stays completely fixed and motionless; only the amber stone in its fork ' +
      'glows warmer and dimmer while the green moss and vine leaves stir softly',
  },
  {
    key: 'oni_slayer_odachi',
    nameWork: '귀참의 대태도',
    nameProposal: '먼저 웃는 칼',
    nameWhy: '칼을 뽑으면 코등이의 도깨비 얼굴이 먼저 웃는다 — 베고 나면 다시 무표정으로 돌아간다',
    anim:
      'the odachi stays completely fixed and rigid; only the crimson flame patterns flow and ' +
      "brighten along the black blade while the oni face's eyes flare red",
  },
  {
    key: 'druid_thorn_staff',
    nameWork: '가시 드루이드 지팡이',
    nameProposal: '손을 부르는 장미',
    nameWhy: '쥐는 자리마다 피가 나는데도 다들 위쪽 장미만 보고 손을 뻗는다',
    anim:
      'the bramble staff stays completely fixed and motionless; only the deep red rose at its ' +
      'crown breathes open and closed while a faint crimson glow pulses among the thorns',
  },
  {
    key: 'angel_orb_scepter',
    nameWork: '보주 홀',
    nameProposal: '멈춘 적 없는 고리',
    nameWhy: '얇은 고리가 한 번도 멈춘 적이 없다 — 들고 있으면 손목이 자꾸 그 속도를 따라간다',
    anim:
      'the gold wand stays completely fixed and motionless; only the thin gold ring turns slowly ' +
      'around the pearl-white orb while the orb glows brighter and dimmer and the tasseled cords sway',
  },
];
