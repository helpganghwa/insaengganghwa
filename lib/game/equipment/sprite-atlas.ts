// Sprite atlas 클라이언트 헬퍼 — 모든 sprite를 단일 WebP atlas 1장으로 렌더.
// 빌드 스크립트(scripts/build-sprite-atlas.ts)가 public/sprites/atlas.webp +
// atlas.json 생성, scripts/build-asset-versions.ts가 내용 해시 파일명 사본(atlas-<hash>.webp)을
// 만든다. 이 파일은 JSON을 import해 컴파일 타임 정적 매핑으로 사용.
//
// 108 PNG 개별 다운로드(개별 요청 × 108) → atlas 1요청. 페이지 전환·인벤
// 마운트 시 sprite 단위 fetch/디코드 사라짐.

import { ASSET_VERSIONS } from '@/lib/asset-versions.generated';

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

// atlas 주소는 `?v=` 쿼리가 아니라 **내용 해시 파일명**이다. Vercel 엣지 캐시 키는 쿼리를 무시해서
// 같은 경로로 바뀐 atlas를 배포하면 엣지가 옛 바이트를 새 `?v=`에 내줬고, 유저 브라우저가 그걸 7일
// 캐시했다(2026-10-28 낙나: 새 좌표 + 옛 그림 → 인벤 그림 뒤바뀜, 새로고침·재설치로도 안 풀림).
// 경로가 바뀌면 엣지도 브라우저도 새로 받는다. 해시가 없으면(스크립트 미실행) 원본 경로로 폴백.
const ATLAS_HASH = ASSET_VERSIONS['/sprites/atlas.webp'];
export const ATLAS_URL = ATLAS_HASH ? `/sprites/atlas-${ATLAS_HASH}.webp` : '/sprites/atlas.webp';
/** 반 해상도 atlas(셀 128, 같은 배치 ÷ 2, 2026-11-06 업데이트 18) — 같은 해시 파일명 방식. */
const ATLAS_SMALL_HASH = ASSET_VERSIONS['/sprites/atlas-128.webp'];
export const ATLAS_SMALL_URL = ATLAS_SMALL_HASH ? `/sprites/atlas-128-${ATLAS_SMALL_HASH}.webp` : ATLAS_URL;
export const ATLAS_SIZE = ATLAS.size;
export const ATLAS_CELL = ATLAS.cell;
/** atlas에 포함된 모든 code 리스트 — 로딩 오버레이 등의 풀로 사용. */
export const ATLAS_CODES: readonly string[] = Object.keys(ATLAS.items);

/** code → atlas 내 좌표. 없으면 null(이모지 폴백). */
export function atlasCoord(code: string): AtlasCoord | null {
  return ATLAS.items[code] ?? null;
}

/**
 * 반 해상도 atlas로 충분한 기기 픽셀 상한(2026-11-06 업데이트 18) — 셀 128을 최대 1.125배까지만 늘려 그린다.
 * 표시 크기 × 기기 배율(DPR)이 이 값 이하면 128 atlas, 넘으면 원본(256).
 */
const SMALL_MAX_DEVICE_PX = 144;

/**
 * 표시 크기(px)에 맞는 atlas 이미지 값(background-image/mask-image) — 크기만으로 정해 서버·클라 결과가 같다.
 *  - 36px 이하: 4배 기기에서도 144 이하 → 128 atlas.
 *  - 37~72px: 기기 배율별 선택(-webkit-image-set, Chrome·Safari·Firefox 지원) — 크기 × 배율이 144 이하인 배율만 128(예: 48px은 3배까지, 64px은 2배까지).
 *  - 73px 이상: 원본.
 * 배경 크기·위치는 CSS px로 같으니(128 atlas = 같은 배치 ÷ 2) 그림 주소만 바뀐다. 캔버스(TranscendSprite)는 원본 그대로.
 */
export function atlasImageFor(size: number): string {
  if (size * 4 <= SMALL_MAX_DEVICE_PX) return `url(${ATLAS_SMALL_URL})`;
  if (size * 2 > SMALL_MAX_DEVICE_PX) return `url(${ATLAS_URL})`;
  const opts = [1, 2, 3, 4].map((r) => `url(${size * r <= SMALL_MAX_DEVICE_PX ? ATLAS_SMALL_URL : ATLAS_URL}) ${r}x`);
  return `-webkit-image-set(${opts.join(', ')})`;
}

/**
 * CSS background-* 속성 객체 — `<div style={atlasBgStyle(code, size)} />` 형태로 사용.
 * size = 렌더 픽셀 크기(정사각). atlas는 비례 스케일. 그림은 크기에 맞는 atlas(atlasImageFor).
 */
export function atlasBgStyle(code: string, size: number): React.CSSProperties | null {
  const c = atlasCoord(code);
  if (!c) return null;
  const scale = size / ATLAS_CELL;
  return {
    width: size,
    height: size,
    backgroundImage: atlasImageFor(size),
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
  // 마스크는 image-set 지원이 들쭉날쭉해 단일 주소로 — 4배 기기에서도 144 이하인 크기만 128 atlas(도감 40px 칸은 3배까지 120).
  const maskImage = `url(${size * 3 <= SMALL_MAX_DEVICE_PX ? ATLAS_SMALL_URL : ATLAS_URL})`;
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
      // 실패한 Promise를 붙들고 있으면 이후 모든 호출(TranscendSprite 캔버스)이 영영 실패한다 — 비워서 재시도 가능하게.
      img.onerror = (e) => {
        atlasPromise = null;
        reject(e);
      };
      img.src = ATLAS_URL;
    });
  }
  return atlasPromise;
}
