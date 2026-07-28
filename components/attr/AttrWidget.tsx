'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

import { runeVectorDesc } from '@/components/RuneName';
import { ATTR_REGION_COLOR, ATTR_REGION_KO, type AvatarAttr } from '@/lib/game/balance';

import { AttrPopup } from './AttrPopup';

// echarts는 무거워 초기 번들에서 제외 — 마운트 후 그려진다(자리는 미리 확보).
const AttrMiniChart = dynamic(() => import('./AttrMiniChart').then((m) => m.AttrMiniChart), {
  ssr: false,
  loading: () => <div className="h-[52px] w-[52px]" />,
});

/**
 * 속성 코너 위젯 — 미니 폴라 차트 + 권역 수치. 배경·보더 없이 얹혀 화면을 가리지 않는다.
 * 위젯 전체가 상성 팝업 트리거. 내 화면(owner)과 남의 프로필(viewer) 양쪽에서 재사용.
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
        <AttrMiniChart attrs={attrs} />
        <div className="mt-0.5 flex flex-col gap-[1px]">
          {vec.length > 0 ? (
            vec.map(([r, v]) => (
              <span
                key={r}
                className="flex items-center gap-[3px] text-[9px] font-bold leading-[1.3] text-zinc-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
              >
                <i
                  className="block h-[4px] w-[4px] shrink-0 rounded-full"
                  style={{ backgroundColor: ATTR_REGION_COLOR[r] }}
                />
                {ATTR_REGION_KO[r]}
                <b className="ml-auto font-mono font-black tabular-nums">{v}</b>
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
