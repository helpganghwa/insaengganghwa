/**
 * 게임 가이드 팁 — GNB 위 GuideTicker가 순차 롤링하고, 탭하면 /guide#{anchor}로 이동.
 * anchor는 app/(game)/guide/page.tsx의 섹션 id와 1:1. 세부 수치는 여기 쓰지 않는다
 * (확률·비용은 /probability가 단일 진실 — 팁은 개념 안내만).
 */
export type GuideTip = { text: string; anchor: string };

export const GUIDE_TIPS: GuideTip[] = [
  // 전투력 — 최우선 인지 목표(2026-07-14 실측: 다수 유저가 장착 6종만 강화)
  { text: '장착하지 않은 장비도 강화하면 전투력이 올라요 — 모든 보유 장비가 합산됩니다!', anchor: 'combat' },
  { text: '전투력은 도감의 모든 장비 강화·초월의 총합이에요. 골고루 키울수록 강해져요.', anchor: 'combat' },

  // 강화
  { text: '강화는 기다릴수록 성공 확률이 올라가요. 최고 확률에 도달한 뒤 수령하면 가장 안전해요.', anchor: 'enhance' },
  { text: '강화 슬롯은 부위당 2개, 총 6개 — 여러 장비를 동시에 돌려보세요.', anchor: 'enhance' },
  { text: '강화 완료를 놓쳐도 손해는 없어요 — 수령하기 전까지 최고 확률로 유지됩니다.', anchor: 'enhance' },
  { text: '급할 땐 다이아로 강화 시간을 단축할 수 있어요.', anchor: 'enhance' },

  // 보급/초월
  { text: '보급상자에서 이미 가진 장비가 나오면 자동으로 초월 재료가 돼요 — 중복도 손해가 아니에요.', anchor: 'supply' },
  { text: '초월 단계가 오르면 장비 테두리 등급이 화려해지고 전투력이 크게 올라요.', anchor: 'transcend' },

  // 레이드
  { text: '레이드 보스를 소환하면 친구·길드원과 함께 사냥할 수 있어요.', anchor: 'raid' },
  { text: '친구·길드원이 소환한 레이드에 참여만 해도 보상을 받아요 — 레이드 탭을 확인하세요.', anchor: 'raid' },
  { text: '레이드는 만료 전까지 공격해 페이즈를 깰수록 보상이 커져요.', anchor: 'raid' },

  // 대난투
  { text: '대난투는 매일 아침 9시, 전투력이 있는 모든 대장장이가 자동 참가해요.', anchor: 'melee' },
  { text: '대난투 결과는 매일 10시에 발표 — 꼴찌여도 참가 보상을 받아요.', anchor: 'melee' },

  // 길드/점령전
  { text: '길드에 가입하면 레이드 공유·기부·점령전까지 함께할 거리가 많아져요.', anchor: 'guild' },
  { text: '점령전은 매일 밤 11시! 길드가 구역을 점령하면 세금 수익이 생겨요.', anchor: 'conquest' },
  { text: '자정마다 어젯밤 점령전의 연대기가 기록돼요 — 월드 지도에서 읽어보세요.', anchor: 'conquest' },
  { text: '거주 구역을 설정하면 내 강화 성공이 그 구역의 세금 포인트로 쌓여요.', anchor: 'conquest' },

  // 아바타
  { text: '나만의 아바타를 AI로 만들 수 있어요 — 지금 착용한 장비가 그대로 반영됩니다.', anchor: 'avatar' },

  // 일일/기타
  { text: '매일 자정에 일일 보급 우편이 도착해요 — 우편함을 잊지 마세요.', anchor: 'daily' },
  { text: '출석 캘린더에서 매일 보상을 챙길 수 있어요.', anchor: 'daily' },
  { text: '친구는 닉네임이나 코드(#)로 검색해 추가할 수 있어요 — 내 코드는 설정에서 확인!', anchor: 'friends' },
  { text: '강화·초월 확률이 궁금하다면 확률 공시 페이지에서 전부 확인할 수 있어요.', anchor: 'misc' },
  { text: '알림을 켜면 강화 완료·레이드·문의 답변을 놓치지 않아요 — 설정에서 켤 수 있어요.', anchor: 'misc' },
];
