'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { ModalShell } from '@/components/ModalShell';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { setActiveProfile, deleteProfile, flipProfile } from './actions';

type ProfileItem = {
  id: string;
  rotations: Record<string, string>;
};

/** 표시용 정면 이미지 — 항상 south(정면, 8방향 미사용). 레거시 프로필 대비 첫 값 폴백. */
function frontSrc(p: ProfileItem): string {
  return p.rotations.south ?? Object.values(p.rotations)[0] ?? '';
}

export function ProfileSelector({
  profiles,
  activeProfileId,
}: {
  profiles: ProfileItem[];
  activeProfileId: string | null;
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
  // 삭제 확인 — 유료로 만든 자산을 지우는 동작이라 11px 알약의 3초 재탭으로는 보호가 약하다.
  // 무엇이 사라지는지 문장으로 읽히는 모달로 승격(2026-07-29 UI 점검).
  const [deleteAsk, setDeleteAsk] = useState(false);

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

  const doDelete = () => {
    if (pending) return;
    setDeleteAsk(false);
    startTransition(async () => {
      const r = await deleteProfile(selectedId);
      if (r.status === 'error') return showError(r.message);
      // 삭제된 캐릭터는 목록에서 제외하고 남은 프로필로 전환 — 상세 페이지 유지.
      const remaining = list.filter((p) => p.id !== selectedId);
      if (remaining.length === 0) {
        router.push('/me');
        return;
      }
      setDeletedIds((s) => new Set(s).add(selectedId));
      setSelectedId(remaining[0]!.id);
      // refresh 제거(2026-08-20, §11.7) — deleteProfile revalidatePath('/me/profiles')
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
        {/* 삭제 — 프리뷰 컨테이너 우상단 코너. 3s 재탭 컨펌(마지막 1개 숨김). */}
        {list.length > 1 ? (
          <button
            type="button"
            onClick={() => setDeleteAsk(true)}
            disabled={pending}
            aria-label="선택한 아바타 삭제"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-red-300 backdrop-blur-sm transition active:scale-95 disabled:opacity-50"
          >
            삭제
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

      {/* 아바타 삭제 확인 — 다이아를 쓰고 10분 걸려 만든 자산이라 되돌릴 수 없음을 명시한다. */}
      {deleteAsk && (
        <ModalShell
          onClose={() => setDeleteAsk(false)}
          onSubmit={doDelete}
          label="아바타 삭제 확인"
        >
          <ModalLayout
            title="이 아바타를 삭제할까요?"
            subtitle={<span className="font-bold text-red-500">복구 불가</span>}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setDeleteAsk(false)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton tone="danger" onClick={doDelete} disabled={pending}>
                  삭제
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              생성에 사용한 다이아는 돌려받을 수 없고, 똑같은 아바타를 다시 만들 수 없습니다.
            </p>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}
