/**
 * 아바타 생성 장비 장착 계획(2026-09-14, 소규모 업데이트 6) — 순수 함수(서버·클라 공용, 테스트 대상).
 *
 * 아바타 관리 화면의 장비 칩 하나가 취할 수 있는 상태는 셋뿐이다:
 *  - `on`  : 그 부위에 지금 장착 중인 장비가 바로 이 칩(탭해도 할 일 없음)
 *  - `can` : 보유 중이고 장착 중이 아님 → 탭하면 장착 확인
 *  - `no`  : 보유 목록에 없음(무기 교체로 사라졌거나 다른 서버 스냅샷) → 탭 불가
 * 세트 버튼은 `can`만 모아 장착하고, `no`는 건너뛰었다고 알린다.
 */
export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export type SnapshotChip = {
  key: string;
  slot: EquipSlot;
  name: string;
  /** 같은 카탈로그 키를 지금 보유 중이면 user_equipment.id(문자열) — 장착 액션의 인자. 미보유 null. */
  userEquipmentId: string | null;
};

/** 부위별 현재 장착(서버 상태 또는 낙관 상태). 비어 있는 부위는 키가 없다. */
export type EquippedNow = Partial<Record<EquipSlot, { key: string; name: string }>>;

export type ChipState = 'on' | 'can' | 'no';

export function chipState(chip: SnapshotChip, now: EquippedNow): ChipState {
  if (now[chip.slot]?.key === chip.key) return 'on';
  return chip.userEquipmentId ? 'can' : 'no';
}

/** 세트 장착 계획 — 장착할 것 / 이미 장착 중 / 미보유로 건너뛸 것. */
export function setPlan(chips: SnapshotChip[], now: EquippedNow): {
  equip: SnapshotChip[];
  already: SnapshotChip[];
  skipped: SnapshotChip[];
} {
  const equip: SnapshotChip[] = [];
  const already: SnapshotChip[] = [];
  const skipped: SnapshotChip[] = [];
  for (const c of chips) {
    const s = chipState(c, now);
    if (s === 'can') equip.push(c);
    else if (s === 'on') already.push(c);
    else skipped.push(c);
  }
  return { equip, already, skipped };
}

/** 낙관 반영용 — 장착할 칩들을 부위별 현재 장착으로 바꾼 패치. */
export function optimisticPatch(items: SnapshotChip[]): EquippedNow {
  const patch: EquippedNow = {};
  for (const c of items) patch[c.slot] = { key: c.key, name: c.name };
  return patch;
}
