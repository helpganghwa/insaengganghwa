import type { BgmTrack } from './bgm';

// 전 화면 공통 BGM(단일 메인 테마). 모든 라우트가 같은 트랙이라 화면 전환 시 매니저가
// 재시작하지 않고 끊김 없이 이어서 재생한다(idle 게임 특성상 한 테마를 길게 트는 게 자연스러움).
// 파일: public/audio/bgm/hub.m4a. (화면별 트랙 분리는 보류 — 도입 시 경로별 분기 추가.)
export function trackForPath(_pathname: string): BgmTrack {
  return 'hub';
}
