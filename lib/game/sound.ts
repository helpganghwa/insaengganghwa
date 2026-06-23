'use client';

// 게임 효과음 파사드 — 호출측은 sounds.xxx()만 쓴다.
// AI 샘플(lib/audio/sfx, public/audio/sfx/<name>.webm)이 있으면 그걸 재생,
// 없으면 Web Audio 8-bit 합성음으로 폴백(파일 배치 전에도 소리가 나도록).
// 토글: 효과음 localStorage 'ig:sound'(값 없으면 켜짐 = 기본 ON). AudioContext는 sfx.ts와 공유.

import { getAudioContext, playSfx, type SfxName } from '@/lib/audio/sfx';

const STORAGE_KEY = 'ig:sound';

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '0'; // 기본 ON
}

type ToneSpec = {
  freq: number;
  duration: number; // sec
  type?: OscillatorType;
  volume?: number;
};

// 합성음 폴백 — 오실레이터로 8-bit 풍 시퀀스 재생(샘플 파일 없을 때만 호출됨).
function playSequence(notes: ToneSpec[]): void {
  const audioCtx = getAudioContext();
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

// 8-bit 폴백 보이스 — 샘플 교체 전까지의 임시 소리.
const synth = {
  tap: () => playSequence([{ freq: 880, duration: 0.04, volume: 0.08 }]),
  error: () =>
    playSequence([
      { freq: 220, duration: 0.07, type: 'square', volume: 0.12 },
      { freq: 160, duration: 0.1, type: 'square', volume: 0.12 },
    ]),
  success: () =>
    playSequence([
      { freq: 523, duration: 0.07 },
      { freq: 784, duration: 0.07 },
      { freq: 1047, duration: 0.16 },
    ]),
  down: () =>
    playSequence([
      { freq: 392, duration: 0.08, type: 'square', volume: 0.14 },
      { freq: 262, duration: 0.16, type: 'square', volume: 0.14 },
    ]),
  raidHit: () =>
    playSequence([
      { freq: 180, duration: 0.06, type: 'sawtooth', volume: 0.18 },
      { freq: 110, duration: 0.1, type: 'square', volume: 0.16 },
    ]),
  raidCrit: () =>
    playSequence([
      { freq: 140, duration: 0.05, type: 'sawtooth', volume: 0.22 },
      { freq: 523, duration: 0.06, volume: 0.18 },
      { freq: 880, duration: 0.07, volume: 0.18 },
      { freq: 1320, duration: 0.14, volume: 0.16 },
    ]),
  coin: () =>
    playSequence([
      { freq: 988, duration: 0.05, volume: 0.12 },
      { freq: 1319, duration: 0.1, volume: 0.12 },
    ]),
  levelup: () =>
    playSequence([
      { freq: 523, duration: 0.06 },
      { freq: 659, duration: 0.06 },
      { freq: 784, duration: 0.06 },
      { freq: 1047, duration: 0.18 },
    ]),
};

// 파일 우선 → 없으면 합성음 폴백. ('disabled'면 토글 OFF라 아무 것도 안 함.)
function voice(name: SfxName, fallback?: () => void): () => void {
  return () => {
    if (!isEnabled()) return;
    const r = playSfx(name);
    if ((r === 'missing' || r === 'pending') && fallback) fallback();
  };
}

export const sounds = {
  // UI
  click: voice('click', synth.tap),
  toggle: voice('toggle', synth.tap),
  error: voice('error', synth.error),
  // 강화
  enhanceStart: voice('enhance-start'),
  enhanceSuccess: voice('enhance-success', synth.success),
  enhanceJackpot: voice('enhance-jackpot', synth.levelup),
  enhanceKeep: voice('enhance-keep'),
  enhanceDown: voice('enhance-down', synth.down),
  // 보급/가챠
  gachaOpen: voice('gacha-open'),
  gachaReveal: voice('gacha-reveal', synth.success),
  // 전투 — 레이드
  raidHit: voice('raid-hit', synth.raidHit),
  raidCrit: voice('raid-crit', synth.raidCrit),
  raidBlock: voice('raid-block'),
  raidVictory: voice('raid-victory', synth.levelup),
  // 전투 — 대난투
  meleeHit: voice('melee-hit', synth.raidHit),
  meleeKo: voice('melee-ko', synth.raidCrit),
  meleeVictory: voice('melee-victory', synth.levelup),
  // 보상/알림
  coin: voice('coin', synth.coin),
  gem: voice('gem', synth.coin),
  levelup: voice('levelup', synth.levelup),
  reward: voice('reward', synth.success),
  // 하위호환 별칭 (기존 호출처 유지)
  rewardClaim: voice('reward', synth.success),
  tap: voice('click', synth.tap),
};
