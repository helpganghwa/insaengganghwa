// 자산 path → hash query 첨부 헬퍼 — client/server 양쪽 사용 가능.
// 빌드 시 scripts/build-asset-versions.ts가 lib/asset-versions.generated.ts
// 갱신(prebuild hook). 파일 변경 시 hash 변동 → 브라우저(모바일 포함) 캐시 자동
// 무효화 — 강력 새로고침 불필요.
//
// 미등록 path는 원본 그대로 반환(폴백 안전).

import { ASSET_VERSIONS } from './asset-versions.generated';

/** 빌드 시점에 존재해 해시가 등록된 자산인가 — 없는 파일을 요청해 404 콘솔 오류를 내지 않으려는 용도(효과음 등). */
export function hasAsset(path: string): boolean {
  return path in ASSET_VERSIONS;
}

/** `assetUrl('/sprites/ui/btn-enhance.png')` → `/sprites/ui/btn-enhance.png?v=ab3f12c8`. */
export function assetUrl(path: string): string {
  const v = ASSET_VERSIONS[path];
  return v ? `${path}?v=${v}` : path;
}
