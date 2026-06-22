'use client';

// 배경음악(BGM) 매니저 — 효과음(lib/game/sound.ts)과 완전 분리.
// 두 <audio> 엘리먼트로 트랙 간 크로스페이드 전환, loop 재생.
//
// 자동재생 정책: 브라우저(설치형 PWA 포함)는 소리 동반 자동재생을 첫 사용자 제스처
// 전까지 차단한다. 그래서 `unlock()`(첫 pointerdown)이 호출되기 전엔 재생을 시도하지
// 않는다. 토글: localStorage 'ig:bgm' = '1'(켜짐), 그 외 꺼짐. 기본 꺼짐.

const STORAGE_KEY = 'ig:bgm';
const BGM_VOLUME = 0.35; // 효과음보다 낮게 — 배경에 깔리도록.
const FADE_MS = 800;
const BASE = '/audio/bgm';

export type BgmTrack =
  | 'hub'
  | 'enhance'
  | 'gacha'
  | 'raid'
  | 'melee'
  | 'guild'
  | 'conquest'
  | 'worldmap'
  | 'shop'
  | 'leaderboard';

let unlocked = false; // 첫 사용자 제스처 후 true — 이후 라우트 전환은 자유 재생.
let current: BgmTrack | null = null; // 현재 의도된 트랙(라우트 매핑 결과).
let active: HTMLAudioElement | null = null; // 실제 재생 중 엘리먼트.

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

function makeAudio(track: BgmTrack): HTMLAudioElement {
  const a = new Audio(`${BASE}/${track}.m4a`);
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  a.dataset.track = track;
  return a;
}

// rAF 기반 볼륨 램프 — 크로스페이드. 같은 엘리먼트에 새 페이드가 걸리면 토큰으로 이전 것 무효화.
const fadeTokens = new WeakMap<HTMLAudioElement, number>();
function fadeTo(el: HTMLAudioElement, target: number, done?: () => void): void {
  const token = (fadeTokens.get(el) ?? 0) + 1;
  fadeTokens.set(el, token);
  const start = el.volume;
  const t0 = performance.now();
  const step = (now: number) => {
    if (fadeTokens.get(el) !== token) return; // 더 최신 페이드가 시작됨 — 중단.
    const p = Math.min(1, (now - t0) / FADE_MS);
    el.volume = Math.max(0, Math.min(1, start + (target - start) * p));
    if (p < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function startCurrent(): void {
  if (!enabled() || !unlocked || !current) return;
  // 이미 같은 트랙이 재생 중이면 무시.
  if (active && active.dataset.track === current && !active.paused) return;

  const next = makeAudio(current);
  const prev = active;
  active = next;
  next
    .play()
    .then(() => fadeTo(next, BGM_VOLUME))
    .catch(() => {
      // 자동재생 차단 또는 파일 부재(404) — 조용히 무시(BGM은 선택적 연출).
    });
  if (prev) {
    fadeTo(prev, 0, () => {
      prev.pause();
      prev.src = '';
    });
  }
}

/** 라우트 매핑 결과를 반영 — 트랙이 바뀌면 크로스페이드. */
export function setTrack(track: BgmTrack): void {
  if (current === track) return;
  current = track;
  startCurrent();
}

/** 첫 사용자 제스처 — 이후부터 재생 허용. */
export function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  startCurrent();
}

/** 설정 토글 — 켜면 즉시 시작(이 호출 자체가 사용자 제스처라 unlock 겸함), 끄면 페이드아웃. */
export function setBgmEnabled(on: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  }
  if (on) {
    unlocked = true;
    startCurrent();
  } else if (active) {
    const a = active;
    active = null;
    fadeTo(a, 0, () => {
      a.pause();
      a.src = '';
    });
  }
}
