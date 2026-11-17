'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import * as haptic from '@/lib/game/haptic';
import { ModalShell } from '@/components/ModalShell';
import { atlasBgStyle } from '@/lib/game/equipment/sprite-atlas';
import { REGION_FILTER_ORDER, catalogRegionUi } from '@/lib/game/equipment/region-ui';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { setActiveProfile, returnProfile, flipProfile, equipSnapshotItems, reorderProfiles } from './actions';
import { chipState, optimisticPatch, setPlan, type EquippedNow, type SnapshotChip } from './equip-plan';
import { canMove, move, sameOrder, type MoveDir } from './reorder-plan';

type ProfileItem = {
  id: string;
  rotations: Record<string, string>;
  /** 기본 아바타(대장장이) — 반환 버튼 미노출 + 서버 가드 이중(2026-09-01). */
  isDefault?: boolean;
  /** 생성 당시 착용 장비(부위 순, 최대 3) — 없으면(기본 아바타·레거시) 줄을 그리지 않는다. */
  equipment?: SnapshotChip[];
  /** 만든 시각(ISO) — 칸의 날짜·최신/오래된순 정렬(11-16). */
  createdAt?: string;
};

type SortKey = 'mine' | 'new' | 'old';
const SORT_LABEL: Record<SortKey, string> = { mine: '내 순서', new: '최신순', old: '오래된순' };
const COLS = [3, 4, 5] as const;
type Cols = (typeof COLS)[number];
// 정렬·열 수는 기기에 기억(편의 설정, 11-16) — 저장소가 막힌 환경에서도 기본값으로 동작.
const PREF_KEY = 'ig:avatarListPref';
function readPref(): { sort: SortKey; cols: Cols } {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as { sort?: string; cols?: number } | null;
    return {
      sort: v?.sort === 'new' || v?.sort === 'old' ? v.sort : 'mine',
      cols: v?.cols === 3 || v?.cols === 5 ? v.cols : 4,
    };
  } catch {
    return { sort: 'mine', cols: 4 };
  }
}
function writePref(p: { sort: SortKey; cols: Cols }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* 저장 실패 — 이번 방문만 적용 */
  }
}
/** KST 월.일 — 칸 아래 작은 날짜. */
function kstMd(iso?: string): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 9 * 3600_000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
type Slot = 'weapon' | 'armor' | 'accessory';
const SLOTS: readonly Slot[] = ['weapon', 'armor', 'accessory'];
type SlotRegion = Record<Slot, string | null>;
const NO_FILTER: SlotRegion = { weapon: null, armor: null, accessory: null };
/** 그 부위 생성 장비의 지역 키(표시 단위, 레거시 값은 같은 키로 합쳐짐). 그 부위가 없으면 null. */
const slotRegionKey = (p: ProfileItem, slot: Slot) => {
  const e = (p.equipment ?? []).find((x) => x.slot === slot);
  return e ? (e.region ? catalogRegionUi(e.region).key : 'general') : null;
};
/** 지역 선택 목록 — 세계지도 순 + 일반. */
const REGION_CHIPS = REGION_FILTER_ORDER.map((r) => catalogRegionUi(r));
/** 부위 필터 칸에 들어가는 짧은 지역명 — 세 칸이 한 줄이라 긴 이름(타락 천사 부유섬)은 잘린다. */
const REGION_SHORT: Record<string, string> = { swamp: '늪', orc: '오크', kingdom: '왕국', temple: '신전', volcano: '화산', angel: '부유섬', general: '일반' };

const SLOT_KO: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

/** 순서 이동 버튼 아이콘(2026-09-15) — 14px, currentColor. 막대 + 삼각형. 한 칸 이동은 드래그로 대신한다(11-17). */
const MOVE_ICON: Record<'first' | 'last', React.ReactNode> = {
  first: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path d="M3.5 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 3.5v9L6.5 8z" fill="currentColor" />
    </svg>
  ),
  last: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path d="M12.5 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 3.5v9L9.5 8z" fill="currentColor" />
    </svg>
  ),
};

/** 표시용 정면 이미지 — 항상 south(정면, 8방향 미사용). 레거시 프로필 대비 첫 값 폴백. */
function frontSrc(p: ProfileItem): string {
  return p.rotations.south ?? Object.values(p.rotations)[0] ?? '';
}

export function ProfileSelector({
  profiles,
  activeProfileId,
  equippedNow,
}: {
  profiles: ProfileItem[];
  activeProfileId: string | null;
  /** 부위별 현재 장착(서버) — 칩 상태(장착 중/장착 가능)와 확인 팝업의 "해제될 장비"의 기준. */
  equippedNow: EquippedNow;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  // 삭제된 프로필은 즉시 목록에서 제외(상세 페이지 유지) — optimistic.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // 순서 편집(2026-09-15, 0200) — 서버 순서(props)를 기준으로 편집 중에는 draft 배열을, 완료 직후에는
  // useOptimistic 값을 보여준다. 완료 때 한 번만 저장하고, 액션의 revalidatePath 응답이 같은 순서의 props를
  // 실어 오면 낙관값에서 자연히 복귀. 실패하면 refresh로 서버 순서 복원 + 에러 토스트.
  const serverOrder = useMemo(() => profiles.map((p) => p.id), [profiles]);
  const [shownOrder, setShownOrder] = useOptimistic(serverOrder, (_s: string[], next: string[]) => next);
  const [draft, setDraft] = useState<readonly string[] | null>(null);
  const editing = draft !== null;
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const list = (draft ?? shownOrder)
    .map((id) => byId.get(id))
    .filter((p): p is ProfileItem => !!p && !deletedIds.has(p.id))
    // 순서 배열이 모르는 아바타(다른 탭에서 방금 생성)는 서버 순서대로 뒤에 붙인다 — 화면에서 사라지지 않게.
    .concat(profiles.filter((p) => !(draft ?? shownOrder).includes(p.id) && !deletedIds.has(p.id)));
  const initId =
    activeProfileId && list.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : list[0]!.id;

  const [selectedId, setSelectedId] = useState<string>(initId);
  // 정렬·필터·열 수(11-16 1안) — 처음 렌더는 기본값(서버와 같게), 마운트 뒤 기기에 기억된 값으로.
  const [sort, setSort] = useState<SortKey>('mine');
  const [cols, setCols] = useState<Cols>(4);
  // 부위별 지역 필터(11-17) — 고른 부위끼리는 모두 맞아야 나온다. regionPick = 지역 목록 시트를 연 부위.
  const [slotRegion, setSlotRegion] = useState<SlotRegion>(NO_FILTER);
  const [regionPick, setRegionPick] = useState<Slot | null>(null);
  const filtering = SLOTS.some((s) => slotRegion[s] !== null);
  useEffect(() => {
    const p = readPref();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 기기 저장값 복원(하이드레이션 뒤 1회)
    setSort(p.sort);
    setCols(p.cols);
  }, []);
  const pickSort = (v: SortKey) => {
    setSort(v);
    writePref({ sort: v, cols });
  };
  const pickCols = (v: Cols) => {
    haptic.tap();
    setCols(v);
    writePref({ sort, cols: v });
  };
  // 크게 보기 팝업(11-16 1안) — 좌우 반전·반환·생성 장비 장착이 이 안으로 옮겨 갔다.
  const [bigOpen, setBigOpen] = useState(false);
  // 대표 아바타 — 누르는 즉시 바꿔 보이고(낙관적), 실패하면 서버 값으로 되돌린다.
  const [activeShown, setActiveShown] = useOptimistic(activeProfileId, (_s: string | null, next: string | null) => next);
  const [repPending, startRep] = useTransition();
  const sel = list.find((p) => p.id === selectedId) ?? list[0]!;
  const [pending, startTransition] = useTransition();
  // 반환 확인(2026-09-01, 구 삭제) — 즉시 회수되는 동작이라 무엇이 벌어지는지 문장으로 읽히는
  // 모달로 확인한다. 사유 선택은 두지 않는다(운영자가 스냅샷으로 판단).
  const [returnAsk, setReturnAsk] = useState(false);

  // 생성 장비 장착(2026-09-14, E2안 + 확인 팝업) — 칩 탭은 그 부위만, '이 세트 장착'은 보유한 부위 전부.
  // 둘 다 공용 팝업으로 무엇이 장착·해제되는지 보여준 뒤 실행한다. 낙관 반영: 확정 즉시 '장착 중'으로
  // 바꾸고, 액션의 revalidatePath('/me/profiles') 응답이 equippedNow prop을 갱신하면 useOptimistic이
  // 그 값으로 복귀(§11.7, 인벤토리 시트와 같은 구조). 에러만 refresh로 서버 실제 상태로 되돌린다.
  const [nowShown, patchNow] = useOptimistic(equippedNow, (state: EquippedNow, patch: EquippedNow) => ({ ...state, ...patch }));
  const [equipAsk, setEquipAsk] = useState<{ kind: 'one' | 'set'; items: SnapshotChip[]; skipped: SnapshotChip[] } | null>(null);
  const [equipPending, startEquip] = useTransition();
  const askEquipOne = (chip: SnapshotChip) => {
    if (equipPending || chipState(chip, nowShown) !== 'can') return;
    haptic.tap();
    setEquipAsk({ kind: 'one', items: [chip], skipped: [] });
  };
  const askEquipSet = (chips: SnapshotChip[]) => {
    if (equipPending) return;
    const plan = setPlan(chips, nowShown);
    if (plan.equip.length === 0) return;
    haptic.tap();
    setEquipAsk({ kind: 'set', items: plan.equip, skipped: plan.skipped });
  };
  const doEquip = () => {
    if (!equipAsk || equipPending) return;
    const items = equipAsk.items;
    setEquipAsk(null);
    haptic.success();
    startEquip(async () => {
      patchNow(optimisticPatch(items));
      const r = await equipSnapshotItems(items.map((c) => c.userEquipmentId ?? '')).catch(() => ({ status: 'error' as const, message: '연결이 끊겨 장착하지 못했어요. 다시 시도해 주세요.' }));
      if (r.status === 'error') {
        showError(r.message);
        router.refresh();
        return;
      }
      showHeaderToast({
        title: items.length === 1 ? `${SLOT_KO[items[0]!.slot]} 장착` : `${r.equipped}개 부위 장착`,
        detail: items.map((c) => c.name).join(' · '),
      });
    });
  };

  // 캐릭터 선택 → 로컬 미리보기만(서버 반영은 "적용" 버튼).
  // 이미 선택한 칸을 한 번 더 누르면 크게 보기(11-17). 순서 편집 중에는 선택만 한다(누르기 = 옮길 아바타).
  const selectChar = (p: ProfileItem) => {
    if (p.id === selectedId) {
      if (!editing) {
        haptic.tap();
        setBigOpen(true);
      }
      return;
    }
    setSelectedId(p.id);
    setFlipPreview(false); // 반전은 확인용 미리보기 — 다른 아바타로 옮기면 초기화
    setFlipHold(null);
  };

  // 좌우 반전 — 버튼은 **미리보기만** CSS로 뒤집는다(2026-08-28 "확인만 하고 싶은데 바로 적용" 피드백).
  // 서버 반영(반전 PNG 저장·URL 교체, flip.ts)은 아래 "적용" 버튼에서만. 짝수 번 누르면 원상태라 변경 없음.
  const [flipPreview, setFlipPreview] = useState(false);
  const [flipping, setFlipping] = useState(false);
  /**
   * 적용 직후 깜빡임 방지 — 서버 성공 시점엔 새(반전본) URL이 아직 프리뷰에 안 실려 있다. 여기 "누를 당시 URL"을
   * 기록해 두고, 프리뷰 src가 그 URL인 동안만 CSS 반전을 유지한다(props가 새 URL로 바뀌면 자동 해제).
   * 새 URL은 해제 전에 프리로드·디코드해 두어 src 교체가 즉시 그려진다.
   */
  const [flipHold, setFlipHold] = useState<string | null>(null);
  const doFlip = () => {
    if (flipping) return;
    haptic.tap();
    setFlipPreview((v) => !v);
  };

  // 대표로 설정(11-16 1안) — 화면에 머문 채 바로 바꾼다(종전엔 /me로 이동). 낙관 반영 후 실패하면 되돌림.
  const setRep = () => {
    if (repPending || selectedId === activeShown) return;
    haptic.success();
    const id = selectedId;
    startRep(async () => {
      setActiveShown(id);
      const r = await setActiveProfile(id).catch(() => ({ status: 'error' as const, message: '연결이 끊겨 바꾸지 못했어요. 다시 시도해 주세요.' }));
      if (r.status === 'error') {
        showError(r.message);
        router.refresh();
        return;
      }
      showHeaderToast({ title: '대표 아바타 변경' });
    });
  };
  // 반전 적용 — 크게 보기 팝업의 미리보기 반전을 서버에 저장(업로드 ~1초라 완료를 기다린다).
  const applyFlip = () => {
    if (!flipPreview || flipping) return;
    haptic.success();
    const id = selectedId;
    setFlipping(true);
    void flipProfile(id)
      .then(async (r) => {
        if (r.status === 'error') {
          showError(r.message);
          return;
        }
        // 새 반전본을 먼저 캐시에 올린 뒤(디코드까지) CSS 반전을 "옛 URL 표시 중"으로만 한정한다.
        try {
          const img = new Image();
          img.src = r.south;
          await img.decode();
        } catch {
          /* 프리로드 실패해도 진행 — 최악의 경우 깜빡임 */
        }
        setFlipHold(frontSrc(sel));
        setFlipPreview(false);
        showHeaderToast({ title: '아바타 좌우 반전' });
      })
      .catch(() => showError('연결이 끊겨 저장하지 못했어요. 다시 시도해 주세요.'))
      .finally(() => setFlipping(false));
  };
  const cssFlipped = (p: ProfileItem) =>
    p.id === selectedId && (flipPreview || (flipHold !== null && frontSrc(p) === flipHold));

  const doReturn = () => {
    if (pending) return;
    setReturnAsk(false);
    startTransition(async () => {
      const r = await returnProfile(selectedId).catch(() => ({ status: 'error' as const, message: '연결이 끊겨 반환하지 못했어요. 다시 시도해 주세요.' }));
      if (r.status === 'error') return showError(r.message);
      showHeaderToast({ title: '검토 후 우편으로 반환 보상이 지급돼요' });
      // 회수된 캐릭터는 목록에서 제외하고 남은 프로필로 전환 — 상세 페이지 유지.
      const remaining = list.filter((p) => p.id !== selectedId);
      if (remaining.length === 0) {
        router.push('/me');
        return;
      }
      setDeletedIds((s) => new Set(s).add(selectedId));
      setSelectedId(remaining[0]!.id);
      setBigOpen(false);
      // refresh 제거(2026-08-20, §11.7) — returnProfile revalidatePath('/me/profiles')
      // 응답 재렌더가 커버(낙관 제거 + prop 갱신).
    });
  };

  // 순서 편집 — 진입은 목록 라벨 줄의 알약. 옮기기는 꾹 눌러 끌어 놓기(11-17, dnd-kit)와
  // 선택 아바타를 맨 앞·맨 뒤로 보내는 두 버튼(수백 개를 끝에서 끝까지 끌기는 오래 걸려서 남김).
  // 편집 중에는 반전·반환·장착·적용을 감춘다(순서만 만진다). 취소는 draft를 버린다.
  const [reorderPending, startReorder] = useTransition();
  const beginEdit = () => {
    if (editing || list.length < 2) return;
    haptic.tap();
    // 순서는 '내 순서'·필터 없음에서만 만진다 — 다른 정렬·필터 중이면 그 상태로 바꾸며 들어간다(11-17 검수:
    // 버튼이 회색으로만 막혀 있으면 휴대폰에선 이유를 알 수 없었다).
    if (sort !== 'mine') pickSort('mine');
    if (filtering) setSlotRegion(NO_FILTER);
    setFlipPreview(false);
    setDraft(list.map((p) => p.id));
  };
  const cancelEdit = () => {
    haptic.tap();
    setDraft(null);
  };
  const moveSel = (dir: MoveDir) => {
    if (!draft) return;
    const next = move(draft, selectedId, dir);
    if (next === draft) return;
    haptic.tap();
    setDraft(next);
    // 옮긴 아바타가 보이게 — 끌어 놓기는 이미 손가락 아래라 버튼 이동에만 스크롤한다.
    requestAnimationFrame(() => selRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  // 끌어 놓기 — 터치는 0.2초 누르고 있어야 시작(짧게 쓸면 스크롤), 마우스는 5px 움직이면 시작.
  // 화면 끝으로 끌면 dnd-kit 자동 스크롤이 목록을 따라 움직인다.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 화면 읽기 안내 — dnd-kit 기본값은 영어라 한국어로(11-17 검수). 몇 번째 자리인지로 말한다.
  const posOf = (id: unknown) => (draft ? draft.indexOf(String(id)) + 1 : 0);
  const dndA11y = {
    screenReaderInstructions: { draggable: '스페이스나 엔터로 아바타를 들고, 방향키로 옮긴 뒤 다시 스페이스나 엔터로 놓아요. ESC를 누르면 취소돼요.' },
    announcements: {
      onDragStart: ({ active }: { active: { id: unknown } }) => `${posOf(active.id)}번째 아바타를 들었어요.`,
      onDragOver: ({ over }: { over: { id: unknown } | null }) => (over ? `${posOf(over.id)}번째 자리 위에 있어요.` : '놓을 자리를 벗어났어요.'),
      onDragEnd: ({ over }: { over: { id: unknown } | null }) => (over ? `${posOf(over.id)}번째 자리에 놓았어요.` : '제자리에 놓았어요.'),
      onDragCancel: () => '옮기기를 취소했어요.',
    },
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const onDragStart = (e: DragStartEvent) => {
    haptic.tap();
    const id = String(e.active.id);
    setDragId(id);
    setSelectedId(id); // 든 아바타가 선택 — 맨 앞·맨 뒤 버튼과 미리보기가 그 아바타를 가리킨다
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    if (!draft || !e.over || e.active.id === e.over.id) return;
    const from = draft.indexOf(String(e.active.id));
    const to = draft.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    haptic.success();
    setDraft(arrayMove([...draft], from, to));
  };
  const finishEdit = () => {
    if (!draft || reorderPending) return;
    const next = [...draft];
    setDraft(null);
    if (sameOrder(next, shownOrder)) return; // 변경 없음 — 요청 없이 닫기
    haptic.success();
    startReorder(async () => {
      setShownOrder(next);
      const r = await reorderProfiles(next).catch(() => ({ status: 'error' as const, message: '연결이 끊겨 저장하지 못했어요. 다시 시도해 주세요.' }));
      if (r.status === 'error') {
        showError(r.message);
        router.refresh();
        return;
      }
      showHeaderToast({ title: '아바타 순서 저장' });
    });
  };
  const selRef = useRef<HTMLButtonElement | null>(null);

  // 보이는 목록 — 편집 중엔 순서 그대로(필터·정렬 없음). 지역 필터: 고른 부위마다 그 부위 생성 장비가
  // 그 지역이어야 한다(AND). 정렬은 같은 값이면 지금 순서를 지킨다(안정 정렬).
  const shown = editing
    ? list
    : (() => {
        let xs = filtering
          ? list.filter((p) => SLOTS.every((s) => slotRegion[s] === null || slotRegionKey(p, s) === slotRegion[s]))
          : list;
        if (sort !== 'mine') {
          const t = (p: ProfileItem) => (p.createdAt ? Date.parse(p.createdAt) : 0);
          xs = [...xs].sort((a, b) => (sort === 'new' ? t(b) - t(a) : t(a) - t(b)));
        }
        return xs;
      })();
  const isRep = sel.id === activeShown;
  const pill = 'rounded-full border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 disabled:opacity-50';

  return (
    <div className="space-y-3">
      {/* 미리보기 줄(11-16 1안) — 목록을 내리면 헤더 바로 아래(스크롤 영역 맨 위)에 붙는다. 헤더는 가리지 않는다
          (11-17 사용자: 헤더를 밀어 올리는 방식은 어색해 되돌림). z는 목록 칸 위. */}
      <div className="sticky top-0 z-20 -mx-4 bg-white/95 px-4 pt-2 pb-2 backdrop-blur dark:bg-zinc-950/95">
        {/* 높이 고정(138 = 이미지 116 + 여백·테두리) — 장비 수(0~3)·기본 아바타·편집 안내에 따라 줄 높이가
            달라지면 아래 목록이 아바타를 고를 때마다 들썩인다(11-17). 장비 줄(이미지 칸+이름)은 3줄 자리를 늘 차지한다. */}
        <div className="flex h-[138px] items-center gap-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => !editing && setBigOpen(true)}
            aria-label="선택한 아바타 크게 보기"
            className="relative flex h-[116px] w-[98px] shrink-0 items-end justify-center overflow-hidden rounded-xl bg-white dark:bg-zinc-950"
          >
            {frontSrc(sel) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frontSrc(sel)}
                alt="아바타"
                draggable={false}
                // cover: 원본은 정사각(256, 위아래 여백 2~4%)이라 세로로 긴 칸에 contain하면 칸 높이의 16%가
                // 머리 위 빈 공간이 된다(11-17). 높이에 맞추면 좌우가 칸 폭의 8%씩 잘리는데, 원본 좌우 투명
                // 여백(15% 이상)보다 작아 그림은 거의 잘리지 않는다.
                className="pointer-events-none h-full w-full object-cover object-bottom"
                style={{ imageRendering: 'pixelated', transform: cssFlipped(sel) ? 'scaleX(-1)' : undefined }}
              />
            ) : null}
          </button>
          <div className="flex h-full min-w-0 flex-1 flex-col justify-center">
            {editing ? (
              <p className="text-[11px] leading-snug break-keep text-zinc-500 dark:text-zinc-400">아바타를 꾹 누른 채 끌어서 원하는 자리에 놓고 완료를 눌러 저장하세요.</p>
            ) : sel.equipment && sel.equipment.length > 0 ? (
              <ul className="h-[84px]">
                {sel.equipment.map((e) => {
                  const ui = e.region ? catalogRegionUi(e.region) : null;
                  const bg = atlasBgStyle(e.key, 22);
                  return (
                    <li key={e.key} className="flex h-[28px] min-w-0 items-center gap-1.5 text-[11.5px]">
                      <span className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                        {bg ? <span aria-hidden style={bg} /> : <span className="text-[9px] text-zinc-400">{SLOT_KO[e.slot].slice(0, 1)}</span>}
                        <i aria-hidden className="absolute -right-0.5 -bottom-0.5 h-[7px] w-[7px] rounded-full ring-2 ring-zinc-50 dark:ring-zinc-900" style={{ background: ui?.color ?? '#a1a1aa' }} />
                      </span>
                      <span className="truncate text-zinc-700 dark:text-zinc-200">{e.name}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex h-[84px] items-center text-[11px] text-zinc-400 dark:text-zinc-500">기본 아바타</p>
            )}
            {!editing ? (
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={setRep}
                  disabled={isRep || repPending || flipping}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                    isRep ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500' : 'bg-violet-600 text-white'
                  }`}
                >
                  {isRep ? '현재 대표' : '대표로 설정'}
                </button>
                <button type="button" onClick={() => setBigOpen(true)} className={`${pill} border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}>
                  크게 보기
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {/* 순서 편집 도구(편집 중) — 선택 아바타를 맨 앞·맨 뒤로 보내는 두 버튼과 취소·완료. 미리보기 줄과 함께 붙어 있다. */}
        {editing && draft ? (
          <div className="mt-2 flex items-center gap-1.5" role="group" aria-label="아바타 순서 이동">
            {(
              [
                ['first', '맨 앞으로'],
                ['last', '맨 뒤로'],
              ] as const
            ).map(([dir, label]) => {
              const ok = canMove(draft, selectedId, dir);
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => moveSel(dir)}
                  disabled={!ok}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 disabled:active:scale-100 ${
                    ok
                      ? 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600'
                  }`}
                >
                  {dir === 'first' ? MOVE_ICON.first : null}
                  <span>{label}</span>
                  {dir === 'last' ? MOVE_ICON.last : null}
                </button>
              );
            })}
            <button type="button" onClick={cancelEdit} disabled={reorderPending} className={`${pill} ml-auto border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400`}>
              취소
            </button>
            <button type="button" onClick={finishEdit} disabled={reorderPending} className={`${pill} border-violet-600 bg-violet-600 text-white`}>
              완료
            </button>
          </div>
        ) : null}
      </div>

      {/* 정렬·순서 편집·열 수 / 지역 필터(11-16 1안 B). 편집 중에는 숨긴다(순서만 만진다). */}
      {!editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="relative">
              <span className="sr-only">정렬</span>
              <select
                value={sort}
                onChange={(e) => pickSort(e.target.value as SortKey)}
                className="appearance-none rounded-full border border-zinc-300 bg-white py-1 pr-6 pl-2.5 text-[11.5px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[9px] text-zinc-400">▼</span>
            </label>
            {list.length > 1 ? (
              <button
                type="button"
                onClick={beginEdit}
                disabled={pending || flipping || reorderPending}
                className={`${pill} border-zinc-300 bg-white text-violet-600 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-violet-400 dark:disabled:text-zinc-600`}
              >
                순서 편집
              </button>
            ) : null}
            <span className="ml-auto text-[10.5px] text-zinc-400 dark:text-zinc-500">보유 {list.length}</span>
            <span className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800" role="group" aria-label="한 줄에 보일 개수">
              {COLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickCols(c)}
                  aria-pressed={cols === c}
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                    cols === c ? 'bg-white text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {c}
                </button>
              ))}
            </span>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="부위별 지역 필터">
            {SLOTS.map((slot) => {
              const k = slotRegion[slot];
              const ui = k ? REGION_CHIPS.find((u) => u.key === k) : null;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    haptic.tap();
                    setRegionPick(slot);
                  }}
                  aria-label={`${SLOT_KO[slot]} 지역 ${ui ? ui.label : '전체'}`}
                  className={`flex min-w-0 flex-1 items-center gap-1 rounded-full border py-1 pr-1.5 pl-2 text-[11px] font-bold ${
                    ui
                      ? 'border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-100'
                      : 'border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  <span className={`shrink-0 ${ui ? 'text-violet-500 dark:text-violet-300/80' : ''}`}>{SLOT_KO[slot]}</span>
                  {ui ? <i aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: ui.color }} /> : null}
                  <span className={`truncate ${ui ? '' : 'font-medium text-zinc-400 dark:text-zinc-500'}`}>{ui ? REGION_SHORT[ui.key] ?? ui.label : '전체'}</span>
                  <span aria-hidden className={`ml-auto pl-0.5 text-[8px] ${ui ? 'text-violet-400 dark:text-violet-300' : 'text-zinc-400'}`}>▼</span>
                </button>
              );
            })}
          </div>
          {filtering ? (
            <div className="flex items-center justify-between px-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>
                조건에 맞는 아바타 <b className="text-zinc-800 dark:text-zinc-100">{shown.length}</b>개
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic.tap();
                  setSlotRegion(NO_FILTER);
                }}
                className="font-bold text-violet-600 dark:text-violet-300"
              >
                초기화
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 보유 목록(격자) — 탭하면 위 미리보기 줄이 바뀐다. 편집 중에는 꾹 눌러 끌어 옮긴다(탭 = 선택).
          칸 아래: 만든 날짜(월.일)와 생성 장비 지역 점(무기·방어구·장신구 순, 11-16 1안 C).
          아래 여백 pb-20 — 떠 있는 아바타 생성 버튼이 마지막 줄을 가리지 않게. */}
      {shown.length === 0 ? (
        <p className="py-10 pb-24 text-center text-[12px] text-zinc-400 dark:text-zinc-500">조건에 맞는 아바타가 없어요.</p>
      ) : editing && draft ? (
        <DndContext id="avatar-reorder" accessibility={dndA11y} sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
          <SortableContext items={draft as string[]} strategy={rectSortingStrategy}>
            <div className="grid gap-1.5 pb-20" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {shown.map((p) => (
                <SortableCell key={p.id} id={p.id} selected={p.id === selectedId} cellRef={p.id === selectedId ? selRef : undefined} onSelect={() => selectChar(p)}>
                  <AvatarCellBody p={p} cols={cols} rep={p.id === activeShown} flipped={cssFlipped(p)} />
                </SortableCell>
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {dragId && byId.get(dragId) ? (
              <div className="relative isolate -rotate-3 scale-105 overflow-hidden rounded-xl border border-violet-500 bg-violet-50 shadow-[0_14px_28px_-8px_rgba(0,0,0,.55)] ring-1 ring-violet-500 dark:bg-violet-950">
                <AvatarCellBody p={byId.get(dragId)!} cols={cols} rep={dragId === activeShown} flipped={false} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="grid gap-1.5 pb-20" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectChar(p)}
              className={`relative isolate overflow-hidden rounded-xl border text-left ${
                p.id === selectedId
                  ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/30'
                  : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
              }`}
            >
              <AvatarCellBody p={p} cols={cols} rep={p.id === activeShown} flipped={cssFlipped(p)} />
            </button>
          ))}
        </div>
      )}

      {/* 아바타 생성 — 하단 메뉴·채팅 미니바 위에 떠 있어 목록 어디서든 누른다(11-17). 편집 중에는 숨긴다(2026-09-16). */}
      {!editing ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-20 mx-auto flex w-full max-w-[390px] justify-center"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px) + var(--chat-dock-h, 0px) + 0.5rem)' }}
        >
          <Link
            prefetch={false}
            href="/me/create"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-600 px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_-6px_rgba(0,0,0,.6)] ring-1 ring-amber-400/40 transition active:scale-95"
          >
            아바타 생성
          </Link>
        </div>
      ) : null}

      {/* 부위 지역 고르기 — 아래에서 올라오는 목록. 고르면 바로 닫힌다. */}
      {regionPick && (
        <ModalShell
          onClose={() => setRegionPick(null)}
          label={`${SLOT_KO[regionPick]} 지역`}
          align="bottom"
          className="w-full max-w-[390px] overflow-hidden rounded-2xl bg-white pb-[env(safe-area-inset-bottom)] dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
            <b className="text-[14px]">{SLOT_KO[regionPick]} 지역</b>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">생성에 쓴 {SLOT_KO[regionPick]} 기준</span>
          </div>
          <ul>
            {[null, ...REGION_CHIPS.map((u) => u.key)]
              .filter((k, i, a) => a.indexOf(k) === i)
              .map((k) => {
                const ui = k ? REGION_CHIPS.find((u) => u.key === k)! : null;
                const on = slotRegion[regionPick] === k;
                return (
                  <li key={k ?? 'all'}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic.tap();
                        const next = { ...slotRegion, [regionPick]: k };
                        setSlotRegion(next);
                        setRegionPick(null);
                        // 고른 아바타가 필터에 걸려 목록에서 사라지면 보이는 첫 아바타로 옮긴다 — 안 보이는 아바타에
                        // '대표로 설정'·크게 보기가 걸려 헷갈리지 않게(11-17 검수).
                        const match = (p: ProfileItem) => SLOTS.every((s) => next[s] === null || slotRegionKey(p, s) === next[s]);
                        if (!match(sel)) {
                          const first = list.find(match);
                          if (first) setSelectedId(first.id);
                        }
                      }}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-2 border-t border-zinc-100 px-4 py-3 text-left text-[13px] dark:border-zinc-800 ${
                        on ? 'font-bold text-violet-700 dark:text-violet-200' : 'text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      <i aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: ui ? ui.color : 'transparent' }} />
                      {ui ? ui.label : '전체'}
                      {on ? <span aria-hidden className="ml-auto text-violet-500 dark:text-violet-300">✓</span> : null}
                    </button>
                  </li>
                );
              })}
          </ul>
        </ModalShell>
      )}

      {/* 크게 보기(11-16 1안) — 큰 이미지·좌우 반전·반환·생성 장비 장착. 반전은 미리보기 후 '반전 적용'으로 저장. */}
      {bigOpen && (
        <ModalShell
          onClose={() => {
            setBigOpen(false);
            setFlipPreview(false);
          }}
          label="아바타 크게 보기"
        >
          <ModalLayout
            title="아바타 크게 보기"
            bodyPad="sm"
            footer={
              <>
                <ModalButton
                  tone="ghost"
                  onClick={() => {
                    setBigOpen(false);
                    setFlipPreview(false);
                  }}
                >
                  닫기
                </ModalButton>
                {flipPreview ? (
                  <ModalButton tone="primary" onClick={applyFlip} disabled={flipping}>
                    {flipping ? '저장 중…' : '반전 적용'}
                  </ModalButton>
                ) : (
                  <ModalButton tone="primary" onClick={setRep} disabled={isRep || repPending}>
                    {isRep ? '현재 대표' : '대표로 설정'}
                  </ModalButton>
                )}
              </>
            }
          >
            <div className="relative px-1">
              <button
                type="button"
                onClick={doFlip}
                disabled={pending || flipping}
                aria-pressed={flipPreview}
                className={`absolute top-0 left-1 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm transition active:scale-95 disabled:opacity-50 ${
                  flipPreview ? 'bg-violet-600/85 text-white' : 'bg-black/55 text-zinc-100'
                }`}
              >
                좌우 반전
              </button>
              {list.length > 1 && !sel.isDefault ? (
                <button
                  type="button"
                  onClick={() => setReturnAsk(true)}
                  disabled={pending}
                  className="absolute top-0 right-1 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-amber-300 backdrop-blur-sm transition active:scale-95 disabled:opacity-50"
                >
                  반환
                </button>
              ) : null}
              <div className="relative mx-auto flex aspect-square w-full max-w-[256px] items-center justify-center overflow-hidden rounded-xl">
                <div className="pointer-events-none absolute bottom-[6%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/45 blur-[6px]" />
                {frontSrc(sel) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frontSrc(sel)}
                    alt="아바타"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
                    style={{ imageRendering: 'pixelated', transform: cssFlipped(sel) ? 'scaleX(-1)' : undefined }}
                  />
                ) : null}
              </div>
              {sel.equipment && sel.equipment.length > 0
                ? (() => {
                    const plan = setPlan(sel.equipment, nowShown);
                    return (
                      <div className="mt-2.5" aria-label="생성에 사용된 장비">
                        <div className="flex h-5 items-center justify-between px-0.5">
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">생성에 사용된 장비</span>
                          {plan.equip.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => askEquipSet(sel.equipment!)}
                              disabled={equipPending}
                              className="rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[10px] font-bold text-amber-600 transition active:scale-95 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-amber-400"
                            >
                              이 세트 장착
                            </button>
                          ) : plan.skipped.length === 0 ? (
                            <span className="text-[10px] font-bold text-violet-500">모두 장착 중</span>
                          ) : null}
                        </div>
                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {sel.equipment.map((e) => {
                            const bg = atlasBgStyle(e.key, 26);
                            const st = chipState(e, nowShown);
                            return (
                              <button
                                key={e.key}
                                type="button"
                                onClick={() => askEquipOne(e)}
                                disabled={st !== 'can' || equipPending}
                                aria-label={`${SLOT_KO[e.slot]} ${e.name}, ${st === 'on' ? '장착 중' : st === 'can' ? '장착' : '미보유'}`}
                                className={`relative flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 pt-1.5 pb-4 text-left transition active:scale-[0.98] ${
                                  st === 'on'
                                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                                    : st === 'can'
                                      ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
                                      : 'border-zinc-200 bg-zinc-50 opacity-45 dark:border-zinc-800 dark:bg-zinc-950'
                                }`}
                              >
                                {bg ? (
                                  <span aria-hidden className="shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-900" style={bg} />
                                ) : (
                                  <span aria-hidden className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-zinc-200 text-[9px] font-bold text-zinc-500 dark:bg-zinc-900">
                                    {SLOT_KO[e.slot].slice(0, 1)}
                                  </span>
                                )}
                                <span className="flex min-w-0 flex-col leading-tight">
                                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{SLOT_KO[e.slot]}</span>
                                  <span className="truncate text-[11px] font-bold text-zinc-800 dark:text-zinc-100">{e.name}</span>
                                </span>
                                <span
                                  aria-hidden
                                  className={`absolute right-1 bottom-1 rounded px-1 text-[8.5px] leading-[1.3] font-extrabold ${
                                    st === 'on'
                                      ? 'bg-violet-600 text-white'
                                      : st === 'can'
                                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                        : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                  }`}
                                >
                                  {st === 'on' ? '장착 중' : st === 'can' ? '장착' : '미보유'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                : null}
            </div>
          </ModalLayout>
        </ModalShell>
      )}
      {/* 장비 장착 확인 — 무엇이 장착되고 같은 부위의 무엇이 해제되는지 부위별로 보여준다.
          장착은 외형 전용(강화·랭킹 무관)이라 경고 톤은 쓰지 않는다. */}
      {equipAsk && (
        <ModalShell onClose={() => setEquipAsk(null)} onSubmit={doEquip} label="장비 장착 확인" stacked={bigOpen}>
          <ModalLayout
            title={equipAsk.kind === 'set' ? '이 세트 장착' : '장비 장착'}
            subtitle={equipAsk.kind === 'set' ? `${equipAsk.items.length}개 부위` : SLOT_KO[equipAsk.items[0]!.slot]}
            bodyPad="sm"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setEquipAsk(null)} disabled={equipPending}>
                  취소
                </ModalButton>
                <ModalButton tone="primary" onClick={doEquip} disabled={equipPending}>
                  {equipAsk.kind === 'set' ? `${equipAsk.items.length}개 장착` : '장착'}
                </ModalButton>
              </>
            }
          >
            {/* 현재 장착 → 장착할 장비, 부위별 한 줄. 문장 대신 두 칸으로 보여준다(2026-09-14 사용자 요청). */}
            <div className="px-1 py-1">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-1 pb-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                <span>현재 장착</span>
                <span aria-hidden className="w-4" />
                <span>장착할 장비</span>
              </div>
              <ul className="space-y-1.5">
                {equipAsk.items.map((c) => {
                  const cur = nowShown[c.slot];
                  return (
                    <li key={c.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
                      <EquipCell itemKey={cur?.key} name={cur?.name} slot={c.slot} tone="current" />
                      <span aria-hidden className="w-4 text-center text-[13px] text-zinc-400">→</span>
                      <EquipCell itemKey={c.key} name={c.name} slot={c.slot} tone="next" />
                    </li>
                  );
                })}
              </ul>
              {equipAsk.skipped.length > 0 ? (
                <p className="px-1 pt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  미보유 {equipAsk.skipped.length}개({equipAsk.skipped.map((c) => c.name).join(', ')})는 건너뜁니다.
                </p>
              ) : null}
            </div>
          </ModalLayout>
        </ModalShell>
      )}

      {/* 아바타 반환 확인 — 즉시 회수 + 사후 지급 구조를 문장으로 고지하고 사유를 받는다. */}
      {returnAsk && (
        <ModalShell
          onClose={() => setReturnAsk(false)}
          onSubmit={doReturn}
          label="아바타 반환 확인"
          stacked={bigOpen}
        >
          <ModalLayout
            title="아바타 반환"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setReturnAsk(false)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={doReturn} disabled={pending}>
                  반환
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              반환한 아바타는 바로 회수되고 되돌릴 수 없습니다. 생성 가이드라인 검토 후 결과에
              문제가 있었다면 생성에 쓴 다이아 <b>전액</b>, 그 외에는 생성에 사용한 다이아의 <b>절반</b>이
              우편으로 지급됩니다. 반환하시겠습니까?
            </p>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}

/** 장착 확인 팝업의 한 칸 — 부위·스프라이트·이름. 비어 있으면 점선 자리표와 '없음'. */
function EquipCell({
  itemKey,
  name,
  slot,
  tone,
}: {
  itemKey?: string;
  name?: string;
  slot: SnapshotChip['slot'];
  tone: 'current' | 'next';
}) {
  const bg = itemKey ? atlasBgStyle(itemKey, 28) : null;
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1.5 ${
        tone === 'next'
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
      }`}
    >
      {bg ? (
        <span aria-hidden className="shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-900" style={bg} />
      ) : (
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-300 text-[11px] text-zinc-400 dark:border-zinc-700"
        >
          –
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{SLOT_KO[slot]}</span>
        <span className={`truncate text-[11px] font-bold ${name ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
          {name ?? '없음'}
        </span>
      </span>
    </div>
  );
}

/** 목록 한 칸의 내용 — 대표 띠·이미지·날짜·지역 점. 일반 칸·끌기 칸·끌리는 그림자가 함께 쓴다. */
function AvatarCellBody({ p, cols, rep, flipped }: { p: ProfileItem; cols: Cols; rep: boolean; flipped: boolean }) {
  return (
    <>
      {/* 대표 배지 — 선택 테두리(보라)와 '대표로 쓰는 것'을 구분(2026-08-02). */}
      {rep ? <span className="absolute top-0 left-0 z-10 rounded-br-md bg-amber-500 px-1 py-px text-[8px] leading-tight font-bold text-white">대표</span> : null}
      <span className="flex aspect-square w-full items-end justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frontSrc(p)}
          alt="아바타"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="pointer-events-none h-full w-full object-contain object-bottom"
          style={{ imageRendering: 'pixelated', transform: flipped ? 'scaleX(-1)' : undefined }}
        />
      </span>
      <span className="flex items-center justify-between gap-1 px-1.5 pt-0.5 pb-1">
        <span className={`font-mono text-zinc-400 dark:text-zinc-500 ${cols === 5 ? 'text-[8.5px]' : 'text-[9.5px]'}`}>{kstMd(p.createdAt)}</span>
        <span className="flex gap-[2px]">
          {(p.equipment ?? []).map((e) => (
            <i key={e.key} aria-hidden className="h-[6px] w-[6px] rounded-full" style={{ background: e.region ? catalogRegionUi(e.region).color : '#a1a1aa' }} />
          ))}
        </span>
      </span>
    </>
  );
}

/**
 * 순서 편집 칸(11-17) — 꾹 눌러 끌기. 끌리는 동안 제자리는 점선 칸(놓일 자리)으로 남고, 손가락을 따라가는
 * 그림자는 DragOverlay가 그린다. 길게 누를 때 iOS 이미지 메뉴·글자 선택이 뜨지 않게 막는다.
 * scroll-margin — 맨 앞·맨 뒤 버튼으로 옮긴 뒤 scrollIntoView가 위에 붙은 미리보기 줄 밑으로 숨지 않게.
 */
function SortableCell({
  id,
  selected,
  cellRef,
  onSelect,
  children,
}: {
  id: string;
  selected: boolean;
  cellRef?: React.RefObject<HTMLButtonElement | null>;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <button
      ref={(el) => {
        setNodeRef(el);
        if (cellRef) cellRef.current = el;
      }}
      type="button"
      onClick={onSelect}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        scrollMarginTop: 200,
        scrollMarginBottom: 120,
      }}
      className={`relative isolate overflow-hidden rounded-xl border text-left select-none ${
        isDragging
          ? 'border-2 border-dashed border-violet-500/70 bg-violet-50/60 dark:bg-violet-950/20 [&>*]:invisible'
          : selected
            ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/30'
            : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      }`}
    >
      {children}
    </button>
  );
}
