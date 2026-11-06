/**
 * 자릿수 슬롯 카운터 — 자릿수마다 숫자 띠를 세로로 굴린다. 47 → 48이면 1의 자리만 7→8로 굴러감.
 *
 * 2026-11-06 업데이트 18 — motion(useSpring·motion.span 자릿수×10) 대신 **CSS transition** 하나로 굴린다. 강화 화면 전용
 * 라이브러리 묶음이 빠지고, 결과 연출 동안 JS가 프레임마다 값을 계산하지 않는다(합성기 transform).
 *  - 움직임은 종전 스프링(stiffness 100·damping 10·mass 1 — motion 기본값)의 해를 그대로 샘플링한 `linear()` 이징이다
 *    (Counter.css). 넘침(약 16%)·되돌아옴·정착 시간(약 1.25초)이 같다. linear() 미지원 브라우저는 넘침 있는 cubic-bezier.
 *  - 띠에는 시작·목표 사이 정수(+넘침 여유)를 위→아래 오름차순으로 깐다. 값 v가 보일 때 띠 위치 = -(v - 띠 첫 정수) × 높이.
 *    종전 셀 배치(숫자 d가 (d - v) × 높이)와 같은 그림이다.
 */
'use client';

import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import './Counter.css';

type PlaceValue = number | '.';

function normalizeNearInteger(num: number): number {
  const nearest = Math.round(num);
  const tolerance = 1e-9 * Math.max(1, Math.abs(num));
  return Math.abs(num - nearest) < tolerance ? nearest : num;
}

function getValueRoundedToPlace(value: number, place: number): number {
  const scaled = value / place;
  return Math.floor(normalizeNearInteger(scaled));
}

const mod10 = (k: number) => ((k % 10) + 10) % 10;
/** 값 v가 보이는 띠 위치(띠 첫 정수 lo, 칸 높이 h). */
const stripY = (v: number, lo: number, h: number) => `translate3d(0, ${-(v - lo) * h}px, 0)`;

interface DigitProps {
  place: PlaceValue;
  value: number;
  height: number;
  digitStyle?: React.CSSProperties;
}

/**
 * 굴림 한 번 — from에서 to로. 같은 값이면 정지.
 * measured=false: 값이 바뀐 직후 — 아직 굴러가던 띠의 **지금 보이는 위치**를 재지 않았다(레이아웃 이펙트가 재서 from을 고친다).
 */
type Roll = { from: number; to: number; measured: boolean };

/** 띠 요소의 지금 보이는 세로 이동(px) — 전환 중이면 그 순간 값. */
function currentTranslateY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  try {
    return new DOMMatrixReadOnly(t).m42;
  } catch {
    return 0;
  }
}

function Digit({ place, value, height, digitStyle }: DigitProps) {
  // hook은 조건 분기보다 위에서 무조건 호출 (rules-of-hooks). '.'이면 값은 미사용.
  const target = place === '.' ? 0 : getValueRoundedToPlace(value, place);
  const [roll, setRoll] = useState<Roll>({ from: target, to: target, measured: true });
  // 값이 바뀌면 직전 목표에서 새 목표로 굴린다(렌더 중 파생 갱신 — 같은 렌더에서 띠 범위가 맞춰진다). 굴러가는 중이었으면
  // 아래 레이아웃 이펙트가 지금 보이는 위치를 재서 from을 그 자리로 고친다(2026-11-06 업데이트 18 — 종전 motion 스프링처럼
  // 중간에서 이어 굴린다. 처음으로 되돌아가 다시 굴리지 않는다).
  if (roll.to !== target) setRoll({ from: roll.to, to: target, measured: false });
  const stripRef = useRef<HTMLSpanElement>(null);
  /** 지금 DOM 띠의 첫 정수 — 보이는 위치(px)를 값으로 바꾸는 기준. */
  const shownLoRef = useRef<number | null>(null);

  // 띠 범위 — 시작·목표 사이 + 스프링 넘침 여유(이동 칸 수의 17% + 1칸). from은 중간 위치(소수)일 수 있다.
  const pad = Math.ceil(Math.abs(roll.to - roll.from) * 0.17) + 1;
  const lo = Math.floor(Math.min(roll.from, roll.to)) - pad;
  const hi = Math.ceil(Math.max(roll.from, roll.to)) + pad;
  // 첫 렌더의 위치만 인라인으로 준다(서버 그림·첫 페인트) — 이후 위치는 이펙트가 직접 정하고, React는 이 값을 다시 쓰지 않는다
  // (렌더마다 바꾸면 굴러가던 전환이 React의 스타일 갱신으로 먼저 끊긴다).
  const [initialTransform] = useState(() => stripY(target, target - 1, height));
  const [initialLo] = useState(() => target - 1);

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const prevLo = shownLoRef.current ?? initialLo;
    if (!roll.measured) {
      // 지금 보이는 값 = 이전 띠 첫 정수 − 이동(px) ÷ 칸 높이. 아직 띠가 이전 범위로 그려진 상태다(이 렌더의 범위는 다음 커밋).
      const shown = prevLo - currentTranslateY(el) / height;
      el.style.transition = 'none';
      el.style.transform = stripY(shown, prevLo, height); // 다음 커밋까지 그 자리에 멈춰 둔다(페인트 전)
      setRoll({ from: Math.abs(shown - roll.from) < 1e-3 ? roll.from : shown, to: roll.to, measured: true });
      return;
    }
    shownLoRef.current = lo;
    // 시작 위치에 전환 없이 놓고 한 번 확정한 뒤, 목표로 전환을 건다.
    el.style.transition = 'none';
    el.style.transform = stripY(roll.from, lo, height);
    if (roll.from === roll.to) return;
    void el.getBoundingClientRect();
    el.style.transition = '';
    el.style.transform = stripY(roll.to, lo, height);
  }, [roll, lo, height, initialLo]);

  if (place === '.') {
    return (
      <span className="counter-digit" style={{ height, ...digitStyle, width: 'fit-content' }}>
        .
      </span>
    );
  }

  return (
    <span className="counter-digit" style={{ height, ...digitStyle }}>
      <span ref={stripRef} className="counter-strip" style={{ transform: initialTransform }}>
        {Array.from({ length: hi - lo + 1 }, (_, i) => (
          <span key={lo + i} className="counter-number" style={{ height }}>
            {mod10(lo + i)}
          </span>
        ))}
      </span>
    </span>
  );
}

interface CounterProps {
  value: number;
  fontSize?: number;
  padding?: number;
  /** 자릿수 배열. 미지정 시 value에서 자동 추정. */
  places?: PlaceValue[];
  gap?: number;
  borderRadius?: number;
  horizontalPadding?: number;
  textColor?: string;
  fontWeight?: React.CSSProperties['fontWeight'];
  containerStyle?: React.CSSProperties;
  counterStyle?: React.CSSProperties;
  digitStyle?: React.CSSProperties;
  gradientHeight?: number;
  gradientFrom?: string;
  gradientTo?: string;
  topGradientStyle?: React.CSSProperties;
  bottomGradientStyle?: React.CSSProperties;
}

export default function Counter({
  value,
  fontSize = 100,
  padding = 0,
  places = [...value.toString()].map((ch, i, a) => {
    if (ch === '.') return '.';
    const dotIndex = a.indexOf('.');
    const isInteger = dotIndex === -1;
    const exponent = isInteger
      ? a.length - i - 1
      : i < dotIndex
        ? dotIndex - i - 1
        : -(i - dotIndex);
    return 10 ** exponent;
  }),
  gap = 8,
  borderRadius = 4,
  horizontalPadding = 8,
  textColor = 'inherit',
  fontWeight = 'inherit',
  containerStyle,
  counterStyle,
  digitStyle,
  gradientHeight = 16,
  gradientFrom = 'black',
  gradientTo = 'transparent',
  topGradientStyle,
  bottomGradientStyle,
}: CounterProps) {
  const height = fontSize + padding;

  const defaultCounterStyle: React.CSSProperties = {
    fontSize,
    gap,
    borderRadius,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    color: textColor,
    fontWeight,
    direction: 'ltr',
  };

  const defaultTopGradientStyle: React.CSSProperties = {
    height: gradientHeight,
    background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`,
  };

  const defaultBottomGradientStyle: React.CSSProperties = {
    height: gradientHeight,
    background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
  };

  return (
    <span className="counter-container" style={containerStyle}>
      <span className="counter-counter" style={{ ...defaultCounterStyle, ...counterStyle }}>
        {places.map((place) => (
          <Digit
            key={String(place)}
            place={place}
            value={value}
            height={height}
            digitStyle={digitStyle}
          />
        ))}
      </span>
      <span className="gradient-container">
        <span className="top-gradient" style={topGradientStyle ?? defaultTopGradientStyle} />
        <span className="bottom-gradient" style={bottomGradientStyle ?? defaultBottomGradientStyle} />
      </span>
    </span>
  );
}
