'use client';

// Web Audio API로 8-bit 풍 사운드 합성. 외부 mp3 의존 없음, 번들 크기 0.
// 토글: localStorage 'ig:sound' = '1' (켜짐), 그 외 = 꺼짐. 설정의 효과음 토글과 연동.

const STORAGE_KEY = 'ig:sound';

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const AC =
    window.AudioContext ??
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

type ToneSpec = {
  freq: number;
  duration: number; // sec
  type?: OscillatorType;
  volume?: number;
};

function playSequence(notes: ToneSpec[]): void {
  if (!isEnabled()) return;
  const audioCtx = getCtx();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

  let when = audioCtx.currentTime;
  for (const n of notes) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = n.type ?? 'square';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(n.volume ?? 0.15, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + n.duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + n.duration);
    when += n.duration;
  }
}

export const sounds = {
  /** 레이드 일반 타격 — 묵직한 임팩트. */
  raidHit: () =>
    playSequence([
      { freq: 180, duration: 0.06, type: 'sawtooth', volume: 0.18 },
      { freq: 110, duration: 0.1, type: 'square', volume: 0.16 },
    ]),
  /** 레이드 치명타 — 강한 임팩트 + 상승음. */
  raidCrit: () =>
    playSequence([
      { freq: 140, duration: 0.05, type: 'sawtooth', volume: 0.22 },
      { freq: 523, duration: 0.06, volume: 0.18 },
      { freq: 880, duration: 0.07, volume: 0.18 },
      { freq: 1320, duration: 0.14, volume: 0.16 },
    ]),
  /** 보상 수령 — 상쾌한 상승음. */
  rewardClaim: () =>
    playSequence([
      { freq: 523, duration: 0.07 },
      { freq: 784, duration: 0.07 },
      { freq: 1047, duration: 0.16 },
    ]),
  tap: () => playSequence([{ freq: 880, duration: 0.04, volume: 0.08 }]),
};
