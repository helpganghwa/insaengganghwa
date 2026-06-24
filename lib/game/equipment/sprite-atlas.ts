// Sprite atlas 클라이언트 헬퍼 — 모든 sprite를 단일 WebP atlas 1장으로 렌더.
// 빌드 스크립트(scripts/build-sprite-atlas.ts)가 public/sprites/atlas.webp +
// atlas.json 생성. 이 파일은 JSON을 import해 컴파일 타임 정적 매핑으로 사용.
//
// 108 PNG 개별 다운로드(개별 요청 × 108) → atlas 1요청. 페이지 전환·인벤
// 마운트 시 sprite 단위 fetch/디코드 사라짐.

import { assetUrl } from '@/lib/asset-versions';

import atlas from '@/public/sprites/atlas.json';

export interface AtlasCoord {
  /** atlas 내 좌상단 x(px) */
  x: number;
  /** atlas 내 좌상단 y(px) */
  y: number;
}

export interface AtlasMeta {
  size: { w: number; h: number };
  cell: number;
  items: Record<string, AtlasCoord>;
}

const ATLAS = atlas as AtlasMeta;

export const ATLAS_URL = assetUrl('/sprites/atlas.webp');
export const ATLAS_SIZE = ATLAS.size;
export const ATLAS_CELL = ATLAS.cell;
/** atlas에 포함된 모든 code 리스트 — 로딩 오버레이 등의 풀로 사용. */
export const ATLAS_CODES: readonly string[] = Object.keys(ATLAS.items);

/** code → atlas 내 좌표. 없으면 null(이모지 폴백). */
export function atlasCoord(code: string): AtlasCoord | null {
  return ATLAS.items[code] ?? null;
}

/**
 * CSS background-* 속성 객체 — `<div style={atlasBgStyle(code, size)} />` 형태로 사용.
 * size = 렌더 픽셀 크기(정사각). atlas는 비례 스케일.
 */
export function atlasBgStyle(code: string, size: number): React.CSSProperties | null {
  const c = atlasCoord(code);
  if (!c) return null;
  const scale = size / ATLAS_CELL;
  return {
    width: size,
    height: size,
    backgroundImage: `url(${ATLAS_URL})`,
    backgroundSize: `${ATLAS_SIZE.w * scale}px ${ATLAS_SIZE.h * scale}px`,
    backgroundPosition: `${-c.x * scale}px ${-c.y * scale}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
}

/**
 * CSS mask-* 속성 객체 — 스프라이트 **형태만** 단색으로 채우는 실루엣용.
 * `<div style={{ ...atlasMaskStyle(code, size), backgroundColor: '...' }} />` 형태.
 * 도감 미획득 칸(형태로 정체 짐작, 색·디테일 숨김)에 사용. 좌표/스케일은 atlasBgStyle과 동일.
 */
export function atlasMaskStyle(code: string, size: number): React.CSSProperties | null {
  const c = atlasCoord(code);
  if (!c) return null;
  const scale = size / ATLAS_CELL;
  const maskImage = `url(${ATLAS_URL})`;
  const maskSize = `${ATLAS_SIZE.w * scale}px ${ATLAS_SIZE.h * scale}px`;
  const maskPosition = `${-c.x * scale}px ${-c.y * scale}px`;
  return {
    width: size,
    height: size,
    WebkitMaskImage: maskImage,
    maskImage,
    WebkitMaskSize: maskSize,
    maskSize,
    WebkitMaskPosition: maskPosition,
    maskPosition,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  };
}

/** atlas 이미지 모듈 전역 1회 로드(브라우저 캐시 + decoded 메모리 공유). */
let atlasPromise: Promise<HTMLImageElement> | null = null;
export function loadAtlasImage(): Promise<HTMLImageElement> {
  if (!atlasPromise) {
    atlasPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = ATLAS_URL;
    });
  }
  return atlasPromise;
}
