// 정적 자산 버전(cache busting) — 빌드 시 file mtime 기반 해시 8자리.
// 모바일 등 강력 새로고침이 어려운 환경에서 이미지 갱신이 안 보이는 문제 해결:
// `src="/sprites/hub/enhance.png?v=<hash>"` 형태로 사용. 파일 mtime이 바뀌면
// hash 달라져 브라우저 캐시 miss → 새 이미지 다운로드.
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PUB = join(process.cwd(), 'public');

const cache = new Map<string, string>();

/**
 * 정적 자산 경로(public/ 기준) → ?v=<8자hash> suffix.
 * 모듈 첫 호출 시 mtime 읽어 캐시(같은 서버 인스턴스에서 안정). 파일 없으면
 * 빈 string(원본 경로 그대로 사용).
 */
export function assetVersion(publicPath: string): string {
  if (cache.has(publicPath)) return cache.get(publicPath)!;
  try {
    const file = join(PUB, publicPath.replace(/^\//, ''));
    if (!existsSync(file)) {
      cache.set(publicPath, '');
      return '';
    }
    const mtime = statSync(file).mtimeMs;
    const v = createHash('sha1').update(`${publicPath}:${mtime}`).digest('hex').slice(0, 8);
    cache.set(publicPath, v);
    return v;
  } catch {
    cache.set(publicPath, '');
    return '';
  }
}

/** path?v=hash 헬퍼. v가 빈 string이면 path 그대로. */
export function vsrc(publicPath: string): string {
  const v = assetVersion(publicPath);
  return v ? `${publicPath}?v=${v}` : publicPath;
}
