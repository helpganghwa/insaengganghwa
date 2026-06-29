'use client';

import { useEffect, useRef } from 'react';

import {
  animFrames as animFrameCount,
  animStripUrl,
  ANIM_CELL,
  hasAnim,
} from '@/lib/game/equipment/anim-atlas';
import {
  atlasBgStyle,
  atlasCoord,
  ATLAS_CELL,
  loadAtlasImage,
} from '@/lib/game/equipment/sprite-atlas';
import {
  hasItemAnim,
  itemAnimFrames,
  itemAnimUrl,
} from '@/lib/game/equipment/item-anim';
import { transcendStyle, TRANSCEND_TUNING } from '@/lib/game/equipment/transcend';

const ITEM_ANIM_MS = 110; // 프레임 간격 — 차분한 루프.

const SLOT_EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;

// 내부 합성 해상도 (finalZ2 프로토타입과 동일 스케일 기준).
const FS = 256;
const MYTHIC_RGB: readonly [number, number, number] = [228, 64, 52];

// 해방 아이템(강화랭킹 1~3위) 후광 색 — 1 골드 / 2 실버 / 3 브론즈 톤.
const RANK_GLOW: Record<number, readonly [number, number, number]> = {
  1: [255, 216, 120],
  2: [226, 232, 240],
  3: [216, 150, 96],
};
/** 해방 등수(1/2/3) 산출 — championRank 우선, 없으면 isChampion(레거시)=1위. */
function libRank(championRank: number | null | undefined, isChampion: boolean): number | null {
  if (championRank === 1 || championRank === 2 || championRank === 3) return championRank;
  return isChampion ? 1 : null;
}

type RGB = readonly [number, number, number];
const lerp = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

// 프레임 에셋 1장만 로드 (모듈 전역 캐시).
let framePromise: Promise<HTMLImageElement> | null = null;
function loadFrame(): Promise<HTMLImageElement> {
  if (!framePromise) {
    framePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = TRANSCEND_TUNING.frameAsset;
    });
  }
  return framePromise;
}

// (color, sub) 별 리컬러+코너처리된 프레임 캔버스 캐시.
const frameCache = new Map<string, HTMLCanvasElement>();

// 해방 애니 프레임 간격(ms) — 갤러리와 동일 체감.
const ANIM_FRAME_MS = 120;
// 코드별 애니 스트립 이미지 로드(모듈 전역 캐시).
const stripCache = new Map<string, Promise<HTMLImageElement>>();
function loadStrip(code: string): Promise<HTMLImageElement> {
  let p = stripCache.get(code);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const url = animStripUrl(code);
      if (!url) { reject(new Error('no strip')); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    stripCache.set(code, p);
  }
  return p;
}

function recolorFrame(img: HTMLImageElement, color: RGB, sub: 0 | 1): HTMLCanvasElement {
  const key = `${color[0]},${color[1]},${color[2]}|${sub}`;
  const cached = frameCache.get(key);
  if (cached) return cached;

  const white = lerp(color, [255, 255, 255], sub === 0 ? TRANSCEND_TUNING.whiteCapI : TRANSCEND_TUNING.whiteCapII);
  const black: RGB = [Math.round(color[0] * 0.3), Math.round(color[1] * 0.3), Math.round(color[2] * 0.3)];

  // 휘도 기반 colorize(black→mid→white) + 알파 유지.
  const tint = (scale: number): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = c.height = FS;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = true;
    const dw = FS * scale;
    x.drawImage(img, (FS - dw) / 2, (FS - dw) / 2, dw, dw);
    const d = x.getImageData(0, 0, FS, FS);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const a = p[i + 3];
      if (a === 0) continue;
      const lum = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
      let r: number, g: number, b: number;
      if (lum < 0.5) {
        const t = lum / 0.5;
        [r, g, b] = lerp(black, color, t);
      } else {
        const t = (lum - 0.5) / 0.5;
        [r, g, b] = lerp(color, white, t);
      }
      p[i] = r; p[i + 1] = g; p[i + 2] = b;
    }
    x.putImageData(d, 0, 0);
    return c;
  };

  const out = document.createElement('canvas');
  out.width = out.height = FS;
  const o = out.getContext('2d')!;
  o.drawImage(tint(1.32), 0, 0);

  if (sub === 1) {
    // II: 같은 프레임 2.3× 확대 → 네 코너만 마스크 겹침 (모서리 문양 자체를 풍성하게).
    const big = tint(TRANSCEND_TUNING.cornerScale);
    const cm = document.createElement('canvas');
    cm.width = cm.height = FS;
    const cx = cm.getContext('2d')!;
    cx.drawImage(big, 0, 0);
    cx.globalCompositeOperation = 'destination-in';
    const rad = FS * 0.46;
    for (const [px, py] of [[0, 0], [FS, 0], [0, FS], [FS, FS]] as const) {
      const grd = cx.createRadialGradient(px, py, 0, px, py, rad);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = grd;
      cx.fillRect(0, 0, FS, FS);
    }
    o.drawImage(cm, 0, 0);
  }

  // 중앙 강제 투명 (개구부 보장).
  o.globalCompositeOperation = 'destination-out';
  o.fillStyle = '#000';
  const inset = FS * 0.13;
  o.beginPath();
  o.roundRect(inset, inset, FS - inset * 2, FS - inset * 2, 16);
  o.fill();
  o.globalCompositeOperation = 'source-over';

  // 전체 알파 캡 (I=0.9 / II=1.0).
  const fa = sub === 0 ? TRANSCEND_TUNING.frameAlphaI : TRANSCEND_TUNING.frameAlphaII;
  if (fa < 1) {
    const d = o.getImageData(0, 0, FS, FS);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = Math.round(d.data[i] * fa);
    o.putImageData(d, 0, 0);
  }

  frameCache.set(key, out);
  return out;
}

function drawStar(x: ctx2d, cx: number, cy: number, R: number, color: RGB) {
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? R : R * 0.4;
    const a = (i * 45 - 90) * (Math.PI / 180);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.closePath();
  const c = lerp(color, [255, 255, 255], 0.3);
  x.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.beginPath();
  x.arc(cx, cy, 2, 0, Math.PI * 2);
  x.fill();
}

type ctx2d = CanvasRenderingContext2D;

interface Props {
  code: string;
  level: number;
  slot?: 'weapon' | 'armor' | 'accessory';
  /** 레거시 — 강화랭킹 1위(챔피언). championRank 미지정 시 1위로 간주. */
  isChampion?: boolean;
  /** 해방 등수(강화랭킹 1~3위) — 1/2/3이면 등수색(골드/실버/브론즈) 후광. null/미지정=후광 없음. */
  championRank?: number | null;
  /** 표시 픽셀 크기 (정사각). 기본 64. */
  size?: number;
  /** 글로우/광택스윕/발광 애니메이션. 기본 true. 정적 컨텍스트(OG 등)는 false. */
  animate?: boolean;
  /**
   * 최고 강화자 연출 방식.
   * - 'additive'(기본): 실제 초월 등급 프레임/글로우/광택 그대로 + 발광만 *추가*. +10 챔피언은 전부 중복.
   * - 'override': 레벨 무관 신화(빨강) 프레임+글로우+발광으로 *대체*, 광택 없음.
   */
  championMode?: 'additive' | 'override';
  className?: string;
  /**
   * true면 등급 frame과 코너 별을 그리지 않음 — 카드 보더가 등급을 표현하는
   * 컨텍스트(인벤토리/도감 타일 등)에서 시각 중복 제거. 글로우·광택·챔피언 발광은
   * 그대로 적용(없으면 강조 사라짐). 정적/동적 두 경로 모두 동일하게 frame skip.
   */
  frameless?: boolean;
  /**
   * 장비 자체 애니(itemanim 스트립)를 재생. 소수 아이템이 돋보이는 showcase 자리(프로필 장착·
   * 가챠 공개·도감 상세)에서만 켠다. 빽빽한 그리드/썸네일은 끄고 정적 atlas 유지(부하·산만 방지).
   * 애니가 없는 code는 자동으로 정적 폴백. 해방(캔버스) 경로와는 독립.
   */
  itemAnim?: boolean;
}

/** 장비 itemanim 스트립을 CSS 스텝 애니(WAAPI)로 프레임 재생 — canvas 불필요·GPU 저렴. */
function ItemAnimSprite({ code, size }: { code: string; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const frames = itemAnimFrames(code);
  const url = itemAnimUrl(code);
  useEffect(() => {
    const el = ref.current;
    if (!el || frames <= 1) return;
    const anim = el.animate(
      [{ backgroundPositionX: '0px' }, { backgroundPositionX: `-${frames * size}px` }],
      { duration: frames * ITEM_ANIM_MS, iterations: Infinity, easing: `steps(${frames})` },
    );
    return () => anim.cancel();
  }, [code, size, frames]);
  if (!url || !frames) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${url})`,
        backgroundSize: `${frames * size}px ${size}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  );
}

/** 8각 별 SVG path (정적 II 코너용 — 캔버스 drawStar와 동일 형태). */
function starPoints(R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? R : R * 0.4;
    const a = (i * 45 - 90) * (Math.PI / 180);
    pts.push(`${(R + Math.cos(a) * rr).toFixed(2)},${(R + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

const EmojiFallback = ({ size, slot, code, className }: { size: number; slot?: Props['slot']; code: string; className?: string }) => (
  <div
    className={className}
    style={{
      width: size, height: size, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.5,
    }}
    aria-label={code}
  >
    {slot ? SLOT_EMOJI[slot] : '❔'}
  </div>
);

/**
 * 정적 경량 렌더 (캔버스/rAF/effect 없음 — 큰 인벤 부하 최소화).
 * 베이스 <img> + CSS 마스크 프레임(등급색) + II 코너 SVG 별.
 * 글로우/배경 없음(확정안). +10/챔피언이 아닌 모든 등급이 이 경로.
 */
function TranscendStatic({
  st, size, code, className, frameless = false, itemAnim = false,
}: {
  st: ReturnType<typeof transcendStyle>;
  size: number;
  code: string;
  className?: string;
  frameless?: boolean;
  itemAnim?: boolean;
}) {
  const [r, g, b] = st.colorRgb;
  const frameCol = `rgb(${r},${g},${b})`;
  const starCol = `rgb(${Math.round(r + (255 - r) * 0.3)},${Math.round(g + (255 - g) * 0.3)},${Math.round(b + (255 - b) * 0.3)})`;
  // sprite는 프레임 안쪽 영역에 더 크게 노출. frameless(도감 상세 등)는 전체 영역.
  const sw = frameless ? size : size * 0.7;
  const inset = size * 0.115;
  const starBox = size * 0.16;
  // Sprite는 atlas(1 WebP)에서 background-position으로 잘라 그림. 150개 PNG 개별 X.
  // itemAnim showcase면 정적 atlas 대신 itemanim 스트립 애니(없는 code는 정적 폴백).
  const useAnim = itemAnim && hasItemAnim(code);
  const bg = useAnim ? null : atlasBgStyle(code, sw);
  return (
    <div
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      aria-label={`${code} +${st.level}${st.labelKo ? ` ${st.labelKo}` : ''}`}
    >
      {useAnim ? (
        <div style={{ position: 'absolute', left: (size - sw) / 2, top: (size - sw) / 2 }}>
          <ItemAnimSprite code={code} size={sw} />
        </div>
      ) : bg ? (
        <div
          aria-hidden
          style={{ position: 'absolute', left: (size - sw) / 2, top: (size - sw) / 2, ...bg }}
        />
      ) : null}
      {st.hasFrame && !frameless ? (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, backgroundColor: frameCol,
            WebkitMaskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
            maskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
            WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          }}
        />
      ) : null}
      {st.hasFrame && !frameless && st.sub === 1
        ? ([[inset, inset], [size - inset, inset], [inset, size - inset], [size - inset, size - inset]] as const).map(
            ([cx, cy], i) => (
              <svg
                key={i}
                aria-hidden
                width={starBox}
                height={starBox}
                viewBox={`0 0 ${starBox} ${starBox}`}
                style={{ position: 'absolute', left: cx - starBox / 2, top: cy - starBox / 2 }}
              >
                <polygon points={starPoints(starBox / 2)} fill={starCol} />
                <circle cx={starBox / 2} cy={starBox / 2} r={starBox * 0.09} fill="rgba(255,255,255,0.92)" />
              </svg>
            ),
          )
        : null}
    </div>
  );
}

export function TranscendSprite(props: Props) {
  const { code, level, slot, isChampion = false, championRank, size = 64, animate = true, className, frameless = false, itemAnim = false } = props;
  const st = transcendStyle(level);
  if (!atlasCoord(code)) return <EmojiFallback size={size} slot={slot} code={code} className={className} />;
  // 동적(캔버스+rAF) 진입 조건:
  //   해방(강화랭킹 1~3위) → 등수색(골드/실버/브론즈) 후광 + 1위는 광택 sheen 추가
  //   그 외 → 정적(프레임/별만). 초월 단계 후광은 폐지(해방 효과로 이전).
  const dynamic = animate && libRank(championRank, isChampion) != null;
  if (!dynamic) {
    return <TranscendStatic st={st} size={size} code={code} className={className} frameless={frameless} itemAnim={itemAnim} />;
  }
  return <TranscendCanvas {...props} />;
}

function TranscendCanvas({
  code,
  level,
  isChampion = false,
  championRank,
  size = 64,
  animate = true,
  championMode = 'additive',
  className,
  frameless = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coord = atlasCoord(code);
  const st = transcendStyle(level);
  // colorRgb는 매 렌더 새 배열 → deps용으로 원시값 추출 (tier에 종속, 안정적).
  const [scr, scg, scb] = st.colorRgb;
  // 후광 아이템(해방)은 캔버스를 size보다 크게 띄워(GLOW_VIEW) 스프라이트는 size 그대로,
  // 후광은 size 박스 밖으로 퍼지게(잘림 방지). 일반 아이템은 1(=size 그대로).
  const GLOW_VIEW = libRank(championRank, isChampion) ? 1.4 : 1;

  useEffect(() => {
    if (!coord) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    let visible = true; // 화면 밖이면 rAF 정지(스크롤 렉/배터리). IntersectionObserver가 토글.
    let built = false;
    // 해방 등수(1/2/3) — 후광 색 결정. rank=1위는 광택 sheen도 추가.
    const rank = libRank(championRank, isChampion);
    const rankColor = rank ? (RANK_GLOW[rank] as RGB) : null;
    // override = 레벨 무관 신화로 대체 / additive = 실제 등급 유지 + 발광만 추가.
    const champOverride = rank === 1 && championMode === 'override';
    const color: RGB = champOverride ? MYTHIC_RGB : [scr, scg, scb];
    const sub: 0 | 1 = (champOverride ? 1 : st.sub ?? 0) as 0 | 1;
    // ── 시각 효과 매핑 ──
    //   showShine   : 광택 스윕(soft-light sheen). **해방 1위(챔피언) 전용**.
    //   showRadiant : 사전합성 블러 후광. **해방 1~3위 전용**(등수색). 초월 후광 폐지.
    //   showGlow    : 라디얼 글로우. 미사용(false).
    //   showFrame   : 등급 프레임. T1+에서 표시(기존 그대로).
    const showGlow = false;
    const showShine = rank === 1;
    const showFrame = (champOverride ? true : st.hasFrame) && !frameless;
    const showRadiant = rankColor != null;
    const dynamic = animate && (showShine || showRadiant);
    // 해방 아이템 + 애니 보유 → 본체를 애니 프레임으로 재생(후광/광택/프레임은 idle 기반 유지).
    const useAnim = dynamic && rank != null && hasAnim(code);
    const nFrames = useAnim ? animFrameCount(code) : 0;

    let frameCanvas: HTMLCanvasElement | null = null;

    const off = document.createElement('canvas');
    off.width = off.height = FS;
    const o = off.getContext('2d')!;
    // sprite 노출 크기 — TranscendStatic의 sw 비율과 동기화.
    // 후광 아이템은 캔버스를 GLOW_VIEW배 키워 띄우므로, FS 내 스프라이트는 1/GLOW_VIEW로 그려
    // 표시상 size 그대로 유지(축소 없음) + 남은 여백을 후광이 채워 size 밖으로 퍼짐.
    const SW = frameless ? FS / GLOW_VIEW : FS * 0.7;
    const SP = (FS - SW) / 2;
    const t = st.tier === 'none' ? 0 : Math.min(1, st.level / 10);
    const bg = lerp([19, 19, 24], [color[0] * 0.13 + 12, color[1] * 0.13 + 12, color[2] * 0.13 + 12] as RGB, t);
    const bgFill = `rgb(${bg[0]},${bg[1]},${bg[2]})`;

    const mkCanvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const c = document.createElement('canvas');
      c.width = c.height = FS;
      return [c, c.getContext('2d')!];
    };

    // 해방 후광 합성 — 주어진 sprite 캔버스의 실루엣을 등수색으로 채우고 3겹 shadowBlur로 번짐.
    // 애니 보유 시 매 프레임 현재 실루엣으로 재합성 → 후광이 idle에 고정되지 않고 본체와 함께 움직임.
    const makeRadiant = (src: HTMLCanvasElement, [rr, rg, rb]: RGB): HTMLCanvasElement => {
      const [rc, rx] = mkCanvas();
      rx.imageSmoothingEnabled = false;
      rx.drawImage(src, 0, 0);
      rx.globalCompositeOperation = 'source-in';
      rx.fillStyle = `rgb(${rr},${rg},${rb})`;
      rx.fillRect(0, 0, FS, FS);
      const [bc, bx] = mkCanvas();
      bx.imageSmoothingEnabled = false;
      bx.shadowColor = `rgba(${rr},${rg},${rb},1)`;
      bx.shadowBlur = 14;
      bx.drawImage(rc, 0, 0);
      bx.shadowBlur = 24;
      bx.globalAlpha = 0.6;
      bx.drawImage(rc, 0, 0);
      bx.shadowBlur = 32;
      bx.globalAlpha = 0.35;
      bx.drawImage(rc, 0, 0);
      return bc;
    };

    // 정적 레이어 1회 사전합성 (프레임마다 재계산 금지 → 끊김 제거).
    let spriteCv: HTMLCanvasElement | null = null; // 베이스 스프라이트(불변·픽셀)
    // 해방 애니 — 스트립 이미지 + 프레임별 합성 스크래치.
    let stripImg: HTMLImageElement | null = null;
    let animSpriteCv: HTMLCanvasElement | null = null;
    let animSpriteX: CanvasRenderingContext2D | null = null;
    let curFrame = -1;
    let brightCv: HTMLCanvasElement | null = null; // glare용 밝아진 sprite(챔피언)
    let frontCv: HTMLCanvasElement | null = null; // 프레임 + 사방 별
    let radiantCv: HTMLCanvasElement | null = null; // 챔피언 발광(블러, 1회)
    const [shineCv, shineX] = mkCanvas(); // 광택 스윕 재사용 스크래치

    const buildStatic = (atlasImg: HTMLImageElement) => {
      const [sc, sx] = mkCanvas();
      sx.imageSmoothingEnabled = false;
      // atlas 부분 그리기 — coord.x,y에서 ATLAS_CELL×ATLAS_CELL 영역 → 캔버스 SP,SP에 SW×SW.
      sx.drawImage(atlasImg, coord.x, coord.y, ATLAS_CELL, ATLAS_CELL, SP, SP, SW, SW);
      spriteCv = sc;
      if (useAnim) { [animSpriteCv, animSpriteX] = mkCanvas(); animSpriteX.imageSmoothingEnabled = false; }

      // Glare용 밝아진 sprite 사전합성 — sprite 자체의 밝아진 버전이 띠 영역에만
      // 잠깐 보이는 방식. Canvas 2D `filter` 속성은 iOS Safari 17+ 한정 지원이라
      // **픽셀 단위 RGB×k**로 처리(모든 브라우저 동일 결과 보장).
      if (showShine) {
        const [bc, bx] = mkCanvas();
        bx.imageSmoothingEnabled = false;
        bx.drawImage(atlasImg, coord.x, coord.y, ATLAS_CELL, ATLAS_CELL, SP, SP, SW, SW);
        const id = bx.getImageData(0, 0, FS, FS);
        const d = id.data;
        const k = 2.4; // 명도 배수
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue; // 투명 픽셀 skip
          d[i] = Math.min(255, d[i]! * k);
          d[i + 1] = Math.min(255, d[i + 1]! * k);
          d[i + 2] = Math.min(255, d[i + 2]! * k);
        }
        bx.putImageData(id, 0, 0);
        brightCv = bc;
      }

      if (showFrame) {
        const [fc, fx] = mkCanvas();
        if (frameCanvas) fx.drawImage(frameCanvas, 0, 0);
        if (sub === 1) {
          const m = FS * 0.115;
          for (const [px, py] of [[m, m], [FS - 1 - m, m], [m, FS - 1 - m], [FS - 1 - m, FS - 1 - m]] as const) {
            drawStar(fx, px, py, 7, color);
          }
        }
        frontCv = fc;
      }

      // 해방 후광 — idle 실루엣 기준 1회 사전합성(애니 보유 시 draw에서 프레임마다 재합성).
      if (showRadiant && rankColor && spriteCv) {
        radiantCv = makeRadiant(spriteCv, rankColor);
      }
    };

    let drawTs = 0;
    const draw = (ph: number) => {
      o.clearRect(0, 0, FS, FS);
      o.globalCompositeOperation = 'source-over';
      o.globalAlpha = 1;

      if (TRANSCEND_TUNING.panelBg === 'tinted') {
        o.fillStyle = bgFill;
        o.beginPath();
        o.roundRect(0, 0, FS, FS, 20);
        o.fill();
      }

      // 글로우 (부드러운 색 라디얼, 알파 낮음) — swap 후 챔피언 전용 표식.
      if (showGlow) {
        const pulse = 0.85 + 0.15 * Math.sin(ph * Math.PI * 2);
        const peak = TRANSCEND_TUNING.championGlowAlpha * pulse;
        const grd = o.createRadialGradient(FS / 2, FS / 2, 0, FS / 2, FS / 2, FS * 0.46);
        grd.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${peak})`);
        grd.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        o.fillStyle = grd;
        o.fillRect(0, 0, FS, FS);
      }

      // 베이스 스프라이트 프레임 결정 — 해방+애니 보유면 현재 프레임으로 재생, 아니면 idle 고정.
      // 프레임이 바뀌면 후광도 현재 실루엣으로 재합성 → 후광이 본체 애니와 함께 움직임(idle 고정 X).
      let baseSprite = spriteCv;
      if (useAnim && stripImg && animSpriteCv && animSpriteX && nFrames > 0) {
        const fi = Math.floor(drawTs / ANIM_FRAME_MS) % nFrames;
        if (fi !== curFrame) {
          curFrame = fi;
          animSpriteX.clearRect(0, 0, FS, FS);
          animSpriteX.drawImage(stripImg, fi * ANIM_CELL, 0, ANIM_CELL, ANIM_CELL, SP, SP, SW, SW);
          if (showRadiant && rankColor) radiantCv = makeRadiant(animSpriteCv, rankColor);
        }
        baseSprite = animSpriteCv;
      }

      // 사전합성 블러 발광 (알파만 펄스 — 아이템 뒤). swap 후 T8+ 등급 표식.
      if (radiantCv) {
        // 글로우 강도 ↑ — baseline 0.95 + 펄스 (0.85~1.0). sprite 외곽 노란 빛이 명확히 보임.
        o.globalAlpha = 0.6 * (0.85 + 0.15 * Math.sin(ph * Math.PI * 2));
        o.drawImage(radiantCv, 0, 0);
        o.globalAlpha = 1;
      }

      if (baseSprite) o.drawImage(baseSprite, 0, 0);

      // Glare — 챔피언 표식.
      //   띠 영역의 brightCv(밝아진 sprite)만 sprite 위에 source-over로 덮음.
      //   → "sprite 자체가 한순간 빛남" 효과. 흰색 line 느낌 X.
      //   - 통과 구간 [0.30, 0.70] (한 주기 40% 활성, 60% 텀)
      //   - σ=0.13 가우시안 peak — 중앙 집중 완화
      if (showShine && spriteCv && brightCv) {
        const sprite = spriteCv;
        const bright = brightCv;
        const drawBand = (phShift: number) => {
          const localPh = ((ph + phShift) * TRANSCEND_TUNING.shineSpeed) % 1;
          if (localPh < 0.30 || localPh > 0.70) return;
          const peakBoost = Math.exp(-Math.pow((localPh - 0.5) / 0.13, 2));
          const alpha = TRANSCEND_TUNING.shineAlpha * peakBoost;
          if (alpha < 0.02) return;
          // 1) shineCv에 brightCv 그림
          shineX.globalAlpha = 1;
          shineX.globalCompositeOperation = 'source-over';
          shineX.clearRect(0, 0, FS, FS);
          shineX.drawImage(bright, 0, 0);
          // 2) 띠 모양 그라데이션 마스크 (활성 0.30~0.70 안에서 빠르게 통과)
          const tband = (localPh - 0.30) / 0.40; // 0..1
          const gx = tband * FS * 1.6 - FS * 0.3;
          const half = FS * TRANSCEND_TUNING.shineWidth;
          const lg = shineX.createLinearGradient(gx - half, 0, gx + half, FS);
          lg.addColorStop(0, 'rgba(255,255,255,0)');
          lg.addColorStop(0.4, 'rgba(255,255,255,0)');
          lg.addColorStop(0.5, 'rgba(255,255,255,1)');
          lg.addColorStop(0.6, 'rgba(255,255,255,0)');
          lg.addColorStop(1, 'rgba(255,255,255,0)');
          shineX.globalCompositeOperation = 'destination-in';
          shineX.fillStyle = lg;
          shineX.fillRect(0, 0, FS, FS);
          // 3) sprite 실루엣 mask (안전망 — brightCv는 이미 sprite 모양)
          shineX.globalCompositeOperation = 'destination-in';
          shineX.drawImage(sprite, 0, 0);
          // 4) 최종 그림 (alpha로 강도 조절)
          o.globalAlpha = alpha;
          o.globalCompositeOperation = 'source-over';
          o.drawImage(shineCv, 0, 0);
          o.globalAlpha = 1;
        };
        drawBand(0);
      }

      // 프레임 + 별 (정적).
      if (frontCv) o.drawImage(frontCv, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    };

    let lastDraw = 0;
    const loop = (ts: number) => {
      if (stopped || !visible) return;
      if (ts - lastDraw >= TRANSCEND_TUNING.fpsIntervalMs) {
        lastDraw = ts;
        drawTs = ts;
        draw((ts / TRANSCEND_TUNING.animPeriodMs) % 1);
      }
      raf = requestAnimationFrame(loop);
    };

    const start = (atlasImg: HTMLImageElement) => {
      buildStatic(atlasImg);
      built = true;
      if (dynamic && visible) raf = requestAnimationFrame(loop);
      else draw(0.2);
    };

    // 화면 밖 타일은 애니메이션 정지 — 다수 캔버스 rAF가 스크롤 중에도 돌아 렉 유발하던 문제 해결.
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        visible = e.isIntersecting;
        if (visible) {
          if (dynamic && built && !stopped && !raf) raf = requestAnimationFrame(loop);
        } else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { rootMargin: '150px' },
    );
    io.observe(canvas);

    // 해방 애니 스트립 병렬 로드(있으면).
    if (useAnim) loadStrip(code).then((img) => { if (!stopped) stripImg = img; }).catch(() => {});

    // atlas 1장(모듈 전역 캐시) + frame 1장 병렬 로드.
    loadAtlasImage()
      .then((atlasImg) => {
        if (stopped) return;
        if (!showFrame) return start(atlasImg);
        loadFrame()
          .then((img) => {
            if (stopped) return;
            frameCanvas = recolorFrame(img, color, sub);
            start(atlasImg);
          })
          .catch(() => start(atlasImg));
      })
      .catch(() => {});

    return () => {
      stopped = true;
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // coord는 같은 code면 안정. 객체 ref 변동 deps 회피 위해 code 사용.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, st.level, st.tier, st.sub, st.hasFrame, scr, scg, scb, isChampion, championRank, championMode, animate, frameless]);

  // base 없음/이모지 폴백은 디스패처(TranscendSprite)가 처리 — 여기 도달 시 base 보장.
  // 표시 캔버스는 size*GLOW_VIEW로 띄우고, 레이아웃 footprint는 size 그대로(래퍼) +
  // overflow-visible로 후광이 박스 밖으로 퍼지게(잘림 방지). 일반 아이템은 GLOW_VIEW=1.
  const view = size * GLOW_VIEW;
  const pad = (view - size) / 2;
  const px = Math.round(view * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 2));
  return (
    <span
      className={className}
      style={{ display: 'inline-block', position: 'relative', width: size, height: size, overflow: 'visible', verticalAlign: 'top' }}
    >
      <canvas
        ref={canvasRef}
        width={px}
        height={px}
        style={{ position: 'absolute', left: -pad, top: -pad, width: view, height: view, display: 'block' }}
        aria-label={`${code} +${st.level}${st.labelKo ? ` ${st.labelKo}` : ''}`}
      />
    </span>
  );
}
