import type { BgmTrack } from './bgm';

// 라우트 → BGM 트랙 매핑. 더 구체적인 경로(/guild/deploy)를 일반 경로(/guild)보다 먼저 검사.
// 매핑 안 되는 화면(내정보·인벤·우편·출석·패스·친구·튜토리얼 등)은 'hub'로 폴백.
export function trackForPath(pathname: string): BgmTrack {
  if (pathname.startsWith('/enhance')) return 'enhance';
  if (pathname.startsWith('/gacha')) return 'gacha';
  if (pathname.startsWith('/raid')) return 'raid';
  if (pathname.startsWith('/melee')) return 'melee';
  if (pathname.startsWith('/guild/deploy')) return 'conquest';
  if (pathname.startsWith('/guild/map')) return 'worldmap';
  if (pathname.startsWith('/guild')) return 'guild';
  if (pathname.startsWith('/shop')) return 'shop';
  if (pathname.startsWith('/leaderboard')) return 'leaderboard';
  return 'hub';
}
