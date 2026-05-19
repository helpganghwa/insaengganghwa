'use client';

import { useEffect, useRef } from 'react';

import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { transcendStyle, TRANSCEND_TUNING } from '@/lib/game/equipment/transcend';

const SLOT_EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;

// 내부 합성 해상도 (finalZ2 프로토타입과 동일 스케일 기준).
const FS = 256;
const MYTHIC_RGB: readonly [number, number, number] = [228, 64, 52];

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
  isChampion?: boolean;
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
  base, st, size, code, className,
}: {
  base: string;
  st: ReturnType<typeof transcendStyle>;
  size: number;
  code: string;
  className?: string;
}) {
  const [r, g, b] = st.colorRgb;
  const frameCol = `rgb(${r},${g},${b})`;
  const starCol = `rgb(${Math.round(r + (255 - r) * 0.3)},${Math.round(g + (255 - g) * 0.3)},${Math.round(b + (255 - b) * 0.3)})`;
  const sw = size * 0.52;
  const inset = size * 0.115;
  const starBox = size * 0.16;
  return (
    <div
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      aria-label={`${code} +${st.level}${st.labelKo ? ` ${st.labelKo}` : ''}`}
    >
      {/* 픽셀아트 — next/image 최적화는 리샘플로 오히려 깨짐(CLAUDE §5.2). raw img 의도. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={base}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', left: (size - sw) / 2, top: (size - sw) / 2,
          width: sw, height: sw, imageRendering: 'pixelated',
        }}
      />
      {st.hasFrame ? (
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
      {st.hasFrame && st.sub === 1
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
  const { code, level, slot, isChampion = false, size = 64, animate = true, className } = props;
  const base = spritePath(code);
  const st = transcendStyle(level);
  if (!base) return <EmojiFallback size={size} slot={slot} code={code} className={className} />;
  // 동적(캔버스+rAF) = 광택(+10) 또는 챔피언 발광. 그 외 전부 정적 경량 경로.
  const dynamic = animate && (isChampion || st.isMax);
  if (!dynamic) {
    return <TranscendStatic base={base} st={st} size={size} code={code} className={className} />;
  }
  return <TranscendCanvas {...props} />;
}

function TranscendCanvas({
  code,
  level,
  isChampion = false,
  size = 64,
  animate = true,
  championMode = 'additive',
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = spritePath(code);
  const st = transcendStyle(level);
  // colorRgb는 매 렌더 새 배열 → deps용으로 원시값 추출 (tier에 종속, 안정적).
  const [scr, scg, scb] = st.colorRgb;

  useEffect(() => {
    if (!base) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    // override = 레벨 무관 신화로 대체 / additive = 실제 등급 유지 + 발광만 추가.
    const champOverride = isChampion && championMode === 'override';
    const color: RGB = champOverride ? MYTHIC_RGB : [scr, scg, scb];
    const sub: 0 | 1 = (champOverride ? 1 : st.sub ?? 0) as 0 | 1;
    const showGlow = TRANSCEND_TUNING.glowEnabled && (champOverride ? true : st.hasGlow);
    const showShine = champOverride ? false : st.isMax; // additive: +10이면 챔피언이어도 광택 유지
    const showFrame = champOverride ? true : st.hasFrame;
    const showRadiant = isChampion; // 발광은 두 모델 공통 — 챔피언 표식
    // 글로우 단독(+8·+9)은 펄스 미미 → 정적. 애니는 +10(스윕)·챔피언만 (성능·끊김 방지).
    const dynamic = animate && (showShine || showRadiant);

    const sprite = new Image();
    let frameCanvas: HTMLCanvasElement | null = null;

    const off = document.createElement('canvas');
    off.width = off.height = FS;
    const o = off.getContext('2d')!;
    const SW = FS * 0.52;
    const SP = (FS - SW) / 2;
    const t = st.tier === 'none' ? 0 : st.level / 10;
    const bg = lerp([19, 19, 24], [color[0] * 0.13 + 12, color[1] * 0.13 + 12, color[2] * 0.13 + 12] as RGB, t);
    const bgFill = `rgb(${bg[0]},${bg[1]},${bg[2]})`;

    const mkCanvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const c = document.createElement('canvas');
      c.width = c.height = FS;
      return [c, c.getContext('2d')!];
    };

    // 정적 레이어 1회 사전합성 (프레임마다 재계산 금지 → 끊김 제거).
    let spriteCv: HTMLCanvasElement | null = null; // 베이스 스프라이트(불변·픽셀)
    let frontCv: HTMLCanvasElement | null = null; // 프레임 + 사방 별
    let radiantCv: HTMLCanvasElement | null = null; // 챔피언 발광(블러, 1회)
    const [shineCv, shineX] = mkCanvas(); // 광택 스윕 재사용 스크래치

    const buildStatic = () => {
      const [sc, sx] = mkCanvas();
      sx.imageSmoothingEnabled = false;
      sx.drawImage(sprite, SP, SP, SW, SW);
      spriteCv = sc;

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

      if (isChampion) {
        const [rc, rx] = mkCanvas();
        rx.imageSmoothingEnabled = false;
        rx.drawImage(sprite, SP, SP, SW, SW);
        rx.globalCompositeOperation = 'source-in';
        rx.fillStyle = 'rgb(255,238,190)';
        rx.fillRect(0, 0, FS, FS);
        const [bc, bx] = mkCanvas();
        bx.filter = 'blur(11px)';
        bx.drawImage(rc, 0, 0);
        radiantCv = bc;
      }
    };

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

      // 글로우 (finalZ2 형태 부드러운 색 라디얼, 알파 낮음).
      if (showGlow) {
        const inten = isChampion ? 1 : Math.pow((st.level - 7) / 3, 0.85);
        const pulse = 0.85 + 0.15 * Math.sin(ph * Math.PI * 2);
        const peak =
          (isChampion ? TRANSCEND_TUNING.championGlowAlpha : TRANSCEND_TUNING.glowAlpha) * inten * pulse;
        const grd = o.createRadialGradient(FS / 2, FS / 2, 0, FS / 2, FS / 2, FS * 0.46);
        grd.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${peak})`);
        grd.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        o.fillStyle = grd;
        o.fillRect(0, 0, FS, FS);
      }

      // 챔피언 발광 (사전합성 블러를 알파만 펄스 — 아이템 뒤).
      if (radiantCv) {
        o.globalAlpha = 0.45 * (0.85 + 0.15 * Math.sin(ph * Math.PI * 2));
        o.drawImage(radiantCv, 0, 0);
        o.globalAlpha = 1;
      }

      // 베이스 스프라이트 (불변).
      if (spriteCv) o.drawImage(spriteCv, 0, 0);

      // 광택 스윕 — soft-light 블렌드(금속 sheen, 흰색 폭발 X) + 좁은 띠, 아이템 실루엣 마스크.
      if (showShine && spriteCv) {
        shineX.clearRect(0, 0, FS, FS);
        const gx = ((ph * TRANSCEND_TUNING.shineSpeed) % 1) * FS * 1.7 - FS * 0.35;
        const half = FS * TRANSCEND_TUNING.shineWidth; // 띠 반폭 (두꺼울수록 눈에 띔)
        const lg = shineX.createLinearGradient(gx - half, 0, gx + half, FS);
        lg.addColorStop(0, 'rgba(255,250,238,0)');
        lg.addColorStop(0.36, 'rgba(255,250,238,0)');
        lg.addColorStop(0.5, `rgba(255,250,238,${TRANSCEND_TUNING.shineAlpha})`);
        lg.addColorStop(0.64, 'rgba(255,250,238,0)');
        lg.addColorStop(1, 'rgba(255,250,238,0)');
        shineX.globalCompositeOperation = 'source-over';
        shineX.fillStyle = lg;
        shineX.fillRect(0, 0, FS, FS);
        shineX.globalCompositeOperation = 'destination-in';
        shineX.drawImage(spriteCv, 0, 0);
        o.globalCompositeOperation = 'soft-light';
        o.drawImage(shineCv, 0, 0);
        o.globalCompositeOperation = 'source-over';
      }

      // 프레임 + 별 (정적).
      if (frontCv) o.drawImage(frontCv, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    };

    let lastDraw = 0;
    const loop = (ts: number) => {
      if (stopped) return;
      if (ts - lastDraw >= TRANSCEND_TUNING.fpsIntervalMs) {
        lastDraw = ts;
        draw((ts / TRANSCEND_TUNING.animPeriodMs) % 1);
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      buildStatic();
      if (dynamic) raf = requestAnimationFrame(loop);
      else draw(0.2);
    };

    sprite.onload = () => {
      if (!showFrame) return start();
      loadFrame()
        .then((img) => {
          if (stopped) return;
          frameCanvas = recolorFrame(img, color, sub);
          start();
        })
        .catch(() => start());
    };
    sprite.src = base;

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [base, st.level, st.tier, st.sub, st.hasFrame, st.hasGlow, st.isMax, scr, scg, scb, isChampion, championMode, animate]);

  // base 없음/이모지 폴백은 디스패처(TranscendSprite)가 처리 — 여기 도달 시 base 보장.
  const px = Math.round(size * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 2));
  return (
    <canvas
      ref={canvasRef}
      width={px}
      height={px}
      className={className}
      style={{ width: size, height: size, display: 'block' }}
      aria-label={`${code} +${st.level}${st.labelKo ? ` ${st.labelKo}` : ''}`}
    />
  );
}
