'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { ModalShell } from '@/components/ModalShell';
import { atlasBgStyle } from '@/lib/game/equipment/sprite-atlas';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { setActiveProfile, returnProfile, flipProfile, equipSnapshotItems } from './actions';
import { chipState, optimisticPatch, setPlan, type EquippedNow, type SnapshotChip } from './equip-plan';

type ProfileItem = {
  id: string;
  rotations: Record<string, string>;
  /** 기본 아바타(대장장이) — 반환 버튼 미노출 + 서버 가드 이중(2026-09-01). */
  isDefault?: boolean;
  /** 생성 당시 착용 장비(부위 순, 최대 3) — 없으면(기본 아바타·레거시) 줄을 그리지 않는다. */
  equipment?: SnapshotChip[];
};

const SLOT_KO: Record<'weapon' | 'armor' | 'accessory', string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

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
  const list = profiles.filter((p) => !deletedIds.has(p.id));
  const initId =
    activeProfileId && list.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : list[0]!.id;

  const [selectedId, setSelectedId] = useState<string>(initId);
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
      const r = await equipSnapshotItems(items.map((c) => c.userEquipmentId ?? ''));
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
  const selectChar = (p: ProfileItem) => {
    if (p.id === selectedId) return;
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

  // 적용 → (반전 대기 중이면 먼저 서버 반전) + 선택 캐릭터를 대표로 커밋.
  const activeDirty = selectedId !== activeProfileId;
  const dirty = activeDirty || flipPreview;
  const apply = () => {
    if (!dirty || flipping) return;
    haptic.success();
    const id = selectedId;
    if (flipPreview) {
      // 반전은 업로드가 걸려(~1초) 완료를 기다린다 — 완료 전 이동하면 /me 헤더가 옛 이미지로 그려진다.
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
            /* 프리로드 실패해도 진행 — 최악의 경우 기존 깜빡임 */
          }
          setFlipHold(frontSrc(sel));
          setFlipPreview(false);
          if (activeDirty) {
            const a = await setActiveProfile(id);
            if (a.status === 'error') {
              showError(a.message);
              return;
            }
          }
          showHeaderToast({ title: activeDirty ? '대표 아바타 변경' : '아바타 좌우 반전' });
          router.push('/me');
          router.refresh();
        })
        .finally(() => setFlipping(false));
      return;
    }
    // 낙관: 로딩 없이 즉시 /me로 이동 → 백그라운드 커밋 후 router.refresh로 보정.
    router.push('/me');
    void setActiveProfile(id).then((r) => {
      if (r.status === 'error') {
        showError(r.message);
        return;
      }
      showHeaderToast({ title: '대표 아바타 변경' });
      router.refresh();
    });
  };
  const cssFlipped = (p: ProfileItem) =>
    p.id === selectedId && (flipPreview || (flipHold !== null && frontSrc(p) === flipHold));

  const doReturn = () => {
    if (pending) return;
    setReturnAsk(false);
    startTransition(async () => {
      const r = await returnProfile(selectedId);
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
      // refresh 제거(2026-08-20, §11.7) — returnProfile revalidatePath('/me/profiles')
      // 응답 재렌더가 커버(낙관 제거 + prop 갱신).
    });
  };

  return (
    <div className="space-y-4">
      {/* 선택된 캐릭터 정면 프리뷰(회전 미사용). */}
      <div className="relative rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        {/* 좌우 반전 — 프리뷰 좌상단 코너(삭제와 대칭). */}
        <button
          type="button"
          onClick={doFlip}
          disabled={pending || flipping}
          aria-label="선택한 아바타 좌우 반전 미리보기"
          aria-pressed={flipPreview}
          className={`absolute left-2 top-2 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm transition active:scale-95 disabled:opacity-50 ${
            flipPreview ? 'bg-violet-600/85 text-white' : 'bg-black/55 text-zinc-100'
          }`}
        >
          좌우 반전
        </button>
        {/* 반환(구 삭제) — 프리뷰 컨테이너 우상단 코너. 모달 확인(마지막 1개·기본 아바타 숨김). */}
        {list.length > 1 && !sel.isDefault ? (
          <button
            type="button"
            onClick={() => setReturnAsk(true)}
            disabled={pending}
            aria-label="선택한 아바타 반환"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-amber-300 backdrop-blur-sm transition active:scale-95 disabled:opacity-50"
          >
            반환
          </button>
        ) : null}
        <div className="relative mx-auto flex aspect-square w-full max-w-[256px] select-none items-center justify-center isolate overflow-hidden rounded-xl">
          {/* 발밑 타원 그림자 */}
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
        {/* 생성 당시 착용 장비(2026-09-14, 문의 "어떤 장비로 만들었는지 항시 확인") — 파견 화면 칩과
            같은 어휘(스프라이트·부위·이름). 탭 없이 항상 보이고, 썸네일을 넘길 때마다 바뀐다.
            강화 수치는 넣지 않는다(스냅샷엔 키만 있어 '지금' 값이 되어 오해를 부른다).
            칩 우하단 라벨이 상태를 말한다: 장착(탭 가능) / 장착 중 / 미보유. 세트 버튼은 장착 가능한
            부위가 하나라도 있을 때만 보인다. */}
        {sel.equipment && sel.equipment.length > 0 ? (() => {
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
                      aria-label={`${SLOT_KO[e.slot]} ${e.name} — ${st === 'on' ? '장착 중' : st === 'can' ? '장착' : '미보유'}`}
                      className={`relative flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 pb-4 pt-1.5 text-left transition active:scale-[0.98] ${
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
                        className={`absolute bottom-1 right-1 rounded px-1 text-[8.5px] font-extrabold leading-[1.3] ${
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
        })() : null}
      </div>

      {/* 보유 목록 — 탭하면 미리보기(적용 버튼으로 확정).
          DragScrollRow — PC에서 드래그·휠로도 넘겨진다(문의: 키보드 화살표가 유일했음). */}
      <DragScrollRow className="flex gap-2 pb-1">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectChar(p)}
            className={`relative flex aspect-square w-16 shrink-0 items-center justify-center isolate overflow-hidden rounded-lg border-2 bg-white dark:bg-zinc-950 ${
              p.id === selectedId
                ? 'border-violet-500'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            {/* 대표 배지 — 선택 테두리(보라)만으로는 '지금 보는 것'과 '대표로 쓰는 것'이
                구분되지 않는다. 하단 버튼은 결과만 알려줄 뿐 어느 썸네일인지는 말하지
                않았다(2026-08-02). */}
            {p.id === activeProfileId ? (
              <span className="absolute left-0 top-0 z-10 rounded-br-md bg-amber-500 px-1 py-px text-[8px] font-bold leading-tight text-white">
                대표
              </span>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frontSrc(p)}
              alt="아바타"
              draggable={false}
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated', transform: cssFlipped(p) ? 'scaleX(-1)' : undefined }}
            />
          </button>
        ))}
      </DragScrollRow>

      {/* 적용 — 선택 캐릭터를 대표 프로필로 커밋 */}
      <button
        type="button"
        onClick={apply}
        disabled={pending || flipping || !dirty}
        className={`w-full rounded-xl py-3.5 text-sm font-bold transition-colors ${
          pending || flipping || !dirty
            ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
            : 'bg-violet-600 text-white'
        }`}
      >
        {flipping ? '적용 중…' : !dirty ? '현재 대표 아바타' : activeDirty ? '이 아바타로 적용' : '반전 적용'}
      </button>

      {/* 장비 장착 확인 — 무엇이 장착되고 같은 부위의 무엇이 해제되는지 부위별로 보여준다.
          장착은 외형 전용(강화·랭킹 무관)이라 경고 톤은 쓰지 않는다. */}
      {equipAsk && (
        <ModalShell onClose={() => setEquipAsk(null)} onSubmit={doEquip} label="장비 장착 확인">
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
