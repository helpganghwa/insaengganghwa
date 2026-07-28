'use client';

import { useState } from 'react';

import { runeVectorDesc } from '@/components/RuneName';
import { ATTR_REGION_COLOR, ATTR_REGION_KO, type AvatarAttr } from '@/lib/game/balance';

import { AttrPopup } from './AttrPopup';

/**
 * 속성 코너 위젯 — **텍스트만**(점 + 지역 + 수치). 52px 차트는 값이 1~3개뿐이라 늘 비어 보여
 * 폐기(2026-07-28 A6). 배경·보더 없이 얹혀 화면을 가리지 않으며, 위젯 전체가 상성 팝업 트리거.
 * 내 화면(owner)과 남의 프로필(viewer) 양쪽에서 재사용.
 */
export function AttrWidget({
  attrs,
  owner,
  ownerNickname,
  ownerSouth,
  myAttrs,
  myNickname,
  mySouth,
  className = '',
}: {
  /** 표시 대상의 속성. */
  attrs: AvatarAttr[];
  /** true = 내 속성(대결 검색 제공) · false = 남의 속성(나와 즉시 비교). */
  owner: boolean;
  ownerNickname: string;
  ownerSouth: string | null;
  /** 남의 프로필에서 '나와 비교'에 쓰는 내 정보(비로그인이면 null). */
  myAttrs?: AvatarAttr[] | null;
  myNickname?: string;
  mySouth?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const vec = runeVectorDesc(attrs);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="속성 상성 보기"
        className={`text-left transition active:scale-95 ${className}`}
      >
        <div className="flex flex-col gap-[1px]">
          {vec.length > 0 ? (
            vec.map(([r, v]) => (
              <span
                key={r}
                className="flex items-center gap-[4px] text-[10px] font-bold leading-[1.4] text-zinc-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
              >
                <i
                  className="block h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ backgroundColor: ATTR_REGION_COLOR[r] }}
                />
                {ATTR_REGION_KO[r]}
                <b className="ml-auto font-mono font-black tabular-nums">{v}%</b>
              </span>
            ))
          ) : (
            <span className="text-[8.5px] text-zinc-400 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
              속성 없음
            </span>
          )}
        </div>
      </button>
      {open ? (
        <AttrPopup
          onClose={() => setOpen(false)}
          attrs={attrs}
          owner={owner}
          ownerNickname={ownerNickname}
          ownerSouth={ownerSouth}
          myAttrs={myAttrs ?? null}
          myNickname={myNickname ?? '나'}
          mySouth={mySouth ?? null}
        />
      ) : null}
    </>
  );
}
