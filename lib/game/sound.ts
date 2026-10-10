'use client';

// 게임 효과음 파사드 — 호출측은 sounds.xxx()만 쓴다.
// AI 샘플(lib/audio/sfx, public/audio/sfx/<name>.webm)이 있으면 그걸 재생,
// 없으면 아래 Web Audio 합성 보이스로 폴백(외부 도구·파일 없이도 소리가 난다).
// 합성 보이스는 오실레이터 + 필터드 노이즈 + 엔벨로프 조합으로 '디자인된 게임음'을 낸다.
// 토글: 효과음 localStorage 'ig:sound'(값 없으면 켜짐 = 기본 ON). AudioContext는 sfx.ts와 공유.

import { getAudioContext, playSfx, type SfxName } from '@/lib/audio/sfx';

const STORAGE_KEY = 'ig:sound';

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // ⚠ 저장소 접근이 throw하면(시크릿·데이터 차단) 효과음 호출부의 **뒤 코드가 통째로 안 돈다** —
  // 레이드 공격이 전송되지 않고 버튼만 비활성으로 굳거나, 강화 오버레이가 안 걷힌다(2026-09-12 검수).
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0'; // 기본 ON
  } catch {
    return true;
  }
}

// ── 합성 엔진 ───────────────────────────────────────────────────────────────
// 클리핑 방지용 마스터 게인(컨텍스트당 1개) + 흰 노이즈 버퍼(0.4s) 캐시.
let masterGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function master(ac: AudioContext): GainNode {
  if (masterGain) return masterGain;
  // 합성음 전체 부스트 — 짧은 트랜지언트라 게인을 크게 키워야 또렷이 들린다.
  // 크게 올리되 리미터(컴프레서)로 피크를 잡아 레이어 많은 효과(잭팟 등)의 클리핑을 방지.
  const g = ac.createGain();
  g.gain.value = 2.6;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -4; // 이 이상은 강하게 압축(사실상 리미팅)
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  g.connect(limiter).connect(ac.destination);
  masterGain = g;
  return g;
}

function whiteNoise(ac: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.4);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

type ToneOpts = {
  freq: number;
  freqEnd?: number; // 지정 시 freq→freqEnd 지수 글라이드(스윕)
  type?: OscillatorType;
  dur: number; // sec
  vol?: number;
  delay?: number; // sec
  attack?: number; // sec (기본 5ms)
};

function tone(ac: AudioContext, o: ToneOpts): void {
  const t0 = ac.currentTime + (o.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + o.dur);
  }
  const vol = o.vol ?? 0.15;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master(ac));
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

type NoiseOpts = {
  dur: number;
  vol?: number;
  delay?: number;
  filter?: BiquadFilterType; // 지정 시 노이즈를 필터에 통과(임팩트·whoosh)
  freq?: number;
  freqEnd?: number; // 필터 컷오프 스윕
  q?: number;
};

function noise(ac: AudioContext, o: NoiseOpts): void {
  const t0 = ac.currentTime + (o.delay ?? 0);
  const src = ac.createBufferSource();
  src.buffer = whiteNoise(ac);
  const g = ac.createGain();
  const vol = o.vol ?? 0.15;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let head: AudioNode = src;
  if (o.filter) {
    const f = ac.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.freq ?? 1000, t0);
    if (o.freqEnd != null) {
      f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + o.dur);
    }
    if (o.q != null) f.Q.value = o.q;
    src.connect(f);
    head = f;
  }
  head.connect(g).connect(master(ac));
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

function play(build: (ac: AudioContext) => void): void {
  const ac = getAudioContext();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  build(ac);
}

// ── 합성 보이스 — 효과음별 전용 디자인 ───────────────────────────────────────
const synth = {
  // UI (범위 외 — 가벼운 블립)
  click: () => play((ac) => tone(ac, { freq: 900, freqEnd: 1350, type: 'triangle', dur: 0.05, vol: 0.1, attack: 0.002 })),
  toggle: () => play((ac) => tone(ac, { freq: 600, freqEnd: 880, type: 'sine', dur: 0.06, vol: 0.1 })),
  error: () =>
    play((ac) => {
      tone(ac, { freq: 300, freqEnd: 200, type: 'square', dur: 0.13, vol: 0.11 });
      tone(ac, { freq: 220, freqEnd: 150, type: 'square', dur: 0.16, vol: 0.1, delay: 0.08 });
    }),

  // 강화 ──
  enhanceSuccess: () =>
    play((ac) => {
      // 밝은 상승 벨 아르페지오 + 반짝.
      [660, 990, 1320].forEach((f, i) =>
        tone(ac, { freq: f, type: 'sine', dur: 0.2, vol: 0.14, delay: i * 0.07 }),
      );
      tone(ac, { freq: 2640, type: 'sine', dur: 0.18, vol: 0.05, delay: 0.14 });
    }),
  enhanceJackpot: () =>
    play((ac) => {
      // 화려한 상승 아르페지오 + 벨 버스트(화음) + 샤르르 반짝(하이패스 노이즈).
      [523, 659, 784, 1047, 1568].forEach((f, i) =>
        tone(ac, { freq: f, type: 'triangle', dur: 0.22, vol: 0.13, delay: i * 0.06 }),
      );
      tone(ac, { freq: 1047, type: 'sine', dur: 0.5, vol: 0.12, delay: 0.34 });
      tone(ac, { freq: 1568, type: 'sine', dur: 0.5, vol: 0.1, delay: 0.34 });
      tone(ac, { freq: 2093, type: 'sine', dur: 0.45, vol: 0.07, delay: 0.36 });
      noise(ac, { dur: 0.4, vol: 0.05, filter: 'highpass', freq: 4000, delay: 0.34 });
    }),
  enhanceKeep: () => play((ac) => tone(ac, { freq: 320, freqEnd: 280, type: 'sine', dur: 0.12, vol: 0.1 })),
  enhanceDown: () =>
    play((ac) => {
      // 귀여운 하락 — 3음 하행.
      [440, 330, 247].forEach((f, i) =>
        tone(ac, { freq: f, type: 'triangle', dur: 0.16, vol: 0.12, delay: i * 0.1 }),
      );
    }),

  // 보급 ──
  gachaOpen: () =>
    play((ac) => {
      // 휙 열림 whoosh(로우패스 상향 스윕) + 팝 + 반짝.
      noise(ac, { dur: 0.28, vol: 0.12, filter: 'lowpass', freq: 500, freqEnd: 3500 });
      tone(ac, { freq: 500, freqEnd: 950, type: 'triangle', dur: 0.1, vol: 0.13, delay: 0.04 });
      tone(ac, { freq: 1900, type: 'sine', dur: 0.18, vol: 0.06, delay: 0.12 });
      tone(ac, { freq: 2500, type: 'sine', dur: 0.16, vol: 0.05, delay: 0.16 });
    }),
  gachaReveal: () =>
    play((ac) => {
      // 반짝이며 상승 + 글리터(하이패스 노이즈).
      [1320, 1760, 2640].forEach((f, i) =>
        tone(ac, { freq: f, type: 'sine', dur: 0.22, vol: 0.1, delay: i * 0.07 }),
      );
      noise(ac, { dur: 0.3, vol: 0.05, filter: 'highpass', freq: 5000, delay: 0.05 });
    }),

  // 전투 — 레이드 ──
  raidHit: () =>
    play((ac) => {
      noise(ac, { dur: 0.07, vol: 0.2, filter: 'bandpass', freq: 800, q: 0.9 });
      tone(ac, { freq: 170, freqEnd: 70, type: 'square', dur: 0.1, vol: 0.16 });
    }),
  raidCrit: () =>
    play((ac) => {
      noise(ac, { dur: 0.09, vol: 0.24, filter: 'bandpass', freq: 1200, q: 0.8 });
      tone(ac, { freq: 200, freqEnd: 60, type: 'sawtooth', dur: 0.12, vol: 0.18 });
      [1800, 2600, 3400].forEach((f, i) =>
        tone(ac, { freq: f, type: 'sine', dur: 0.16, vol: 0.06, delay: 0.02 + i * 0.015 }),
      );
    }),

  // 전투 — 대난투 ──
  meleeHit: () =>
    play((ac) => {
      noise(ac, { dur: 0.06, vol: 0.2, filter: 'bandpass', freq: 700, q: 1.0 });
      tone(ac, { freq: 160, freqEnd: 80, type: 'square', dur: 0.09, vol: 0.15 });
    }),
  meleeKo: () =>
    play((ac) => {
      // 묵직한 KO — 타격 어택 + 무거운 thud + 하향 whoosh.
      noise(ac, { dur: 0.05, vol: 0.16, filter: 'bandpass', freq: 900, q: 0.8 });
      tone(ac, { freq: 140, freqEnd: 45, type: 'sawtooth', dur: 0.16, vol: 0.2 });
      noise(ac, { dur: 0.18, vol: 0.16, filter: 'lowpass', freq: 1200, freqEnd: 200, delay: 0.02 });
    }),
  // 무한의 탑 — 몬스터가 광폭해질 때 낮게 으르렁(급소는 레이드 치명타 소리를 쓴다).
  towerEnrage: () =>
    play((ac) => {
      tone(ac, { freq: 90, freqEnd: 55, type: 'sawtooth', dur: 0.35, vol: 0.18 });
      noise(ac, { dur: 0.3, vol: 0.12, filter: 'lowpass', freq: 500, freqEnd: 150, delay: 0.03 });
    }),
  // 월드보스(잿불의 불사조) — 레이드·대난투보다 크고 무거운 결. 타격은 거체 울림, 약점은 쩍 갈라지는 균열,
  // 보스의 반격은 날개 바람 + 잿불 타닥, 전리품은 타격 뒤에 따로 울려 '맞았다 → 떨어졌다'가 귀로 구분된다.
  worldBossRoar: () =>
    play((ac) => {
      // 불사조 울음 — 날카로운 외침(톱니 하강 글라이드 두 겹) + 땅울림 + 날개 바람(로우패스 상향 스윕) + 잿불 타닥.
      tone(ac, { freq: 1100, freqEnd: 520, type: 'sawtooth', dur: 0.55, vol: 0.11, attack: 0.04 });
      tone(ac, { freq: 1650, freqEnd: 780, type: 'sawtooth', dur: 0.5, vol: 0.05, attack: 0.05, delay: 0.03 });
      tone(ac, { freq: 95, freqEnd: 48, type: 'sawtooth', dur: 0.7, vol: 0.16, attack: 0.02 });
      noise(ac, { dur: 0.6, vol: 0.1, filter: 'lowpass', freq: 300, freqEnd: 1800 });
      [0.08, 0.19, 0.27, 0.41].forEach((d) => noise(ac, { dur: 0.04, vol: 0.05, filter: 'highpass', freq: 5000, delay: d }));
    }),
  worldBossDepart: () =>
    play((ac) => {
      // 출정 — 큰북 두 번 + 뿔피리(5도 상승, 톱니 두 겹 디튠으로 금관 느낌).
      [0, 0.22].forEach((d) => {
        tone(ac, { freq: 70, freqEnd: 40, type: 'sine', dur: 0.22, vol: 0.22, delay: d });
        noise(ac, { dur: 0.08, vol: 0.12, filter: 'lowpass', freq: 400, delay: d });
      });
      tone(ac, { freq: 262, type: 'sawtooth', dur: 0.22, vol: 0.09, attack: 0.03, delay: 0.1 });
      tone(ac, { freq: 392, type: 'sawtooth', dur: 0.55, vol: 0.1, attack: 0.03, delay: 0.3 });
      tone(ac, { freq: 394, type: 'sawtooth', dur: 0.55, vol: 0.05, attack: 0.03, delay: 0.3 });
    }),
  worldBossHit: () =>
    play((ac) => {
      // 거체 타격 — 레이드 타격보다 낮고 길게 울린다.
      noise(ac, { dur: 0.08, vol: 0.2, filter: 'bandpass', freq: 600, q: 0.8 });
      tone(ac, { freq: 150, freqEnd: 55, type: 'square', dur: 0.12, vol: 0.16 });
      tone(ac, { freq: 60, freqEnd: 40, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.01 });
    }),
  worldBossWeak: () =>
    play((ac) => {
      // 약점 적중 — 쩍 갈라지는 균열(고역 노이즈) + 무거운 어택 + 균열 틈의 반짝(고음 3연).
      noise(ac, { dur: 0.06, vol: 0.24, filter: 'bandpass', freq: 2400, q: 0.7 });
      tone(ac, { freq: 180, freqEnd: 55, type: 'sawtooth', dur: 0.14, vol: 0.18 });
      [2093, 2794, 3520].forEach((f, i) => tone(ac, { freq: f, type: 'sine', dur: 0.2, vol: 0.07, delay: 0.03 + i * 0.03 }));
    }),
  worldBossSweep: () =>
    play((ac) => {
      // 날갯짓 — 바람이 휙 지나가고 되돌아오는 두 스윕 + 잿불 타닥 + 대원이 쓰러지는 둔탁한 끝.
      noise(ac, { dur: 0.3, vol: 0.18, filter: 'lowpass', freq: 400, freqEnd: 2600 });
      noise(ac, { dur: 0.25, vol: 0.14, filter: 'lowpass', freq: 2600, freqEnd: 250, delay: 0.22 });
      [0.12, 0.2, 0.31].forEach((d) => noise(ac, { dur: 0.04, vol: 0.06, filter: 'highpass', freq: 4500, delay: d }));
      tone(ac, { freq: 120, freqEnd: 40, type: 'sawtooth', dur: 0.2, vol: 0.18, delay: 0.3 });
    }),
  worldBossLoot: () =>
    play((ac) => {
      // 좋은 전리품 — 타격 뒤(0.1s) 두 음 보석 종 + 글리터.
      tone(ac, { freq: 1319, type: 'triangle', dur: 0.12, vol: 0.1, delay: 0.1 });
      tone(ac, { freq: 1976, type: 'triangle', dur: 0.2, vol: 0.1, delay: 0.18 });
      noise(ac, { dur: 0.2, vol: 0.04, filter: 'highpass', freq: 6000, delay: 0.18 });
    }),
  worldBossJackpot: () =>
    play((ac) => {
      // 대박 전리품 — 상승 아르페지오 + 벨 화음 + 글리터, 밑에서 낮은 종이 받친다.
      [784, 988, 1175, 1568, 2349].forEach((f, i) => tone(ac, { freq: f, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.1 + i * 0.05 }));
      tone(ac, { freq: 1568, type: 'sine', dur: 0.55, vol: 0.12, delay: 0.38 });
      tone(ac, { freq: 2349, type: 'sine', dur: 0.5, vol: 0.09, delay: 0.38 });
      tone(ac, { freq: 196, type: 'sine', dur: 0.8, vol: 0.12, delay: 0.36 });
      noise(ac, { dur: 0.45, vol: 0.05, filter: 'highpass', freq: 4500, delay: 0.38 });
    }),
  worldBossVictory: () =>
    play((ac) => {
      // 원정 종료 팡파레 — 금관(톱니 디튠 두 겹) 4음 상승 + 밝은 지속 화음.
      [392, 523, 659, 784].forEach((f, i) => {
        tone(ac, { freq: f, type: 'sawtooth', dur: 0.18, vol: 0.09, delay: i * 0.08 });
        tone(ac, { freq: f * 1.003, type: 'sawtooth', dur: 0.18, vol: 0.04, delay: i * 0.08 });
      });
      tone(ac, { freq: 1047, type: 'sawtooth', dur: 0.6, vol: 0.09, delay: 0.34 });
      tone(ac, { freq: 1319, type: 'triangle', dur: 0.6, vol: 0.08, delay: 0.36 });
      tone(ac, { freq: 1568, type: 'sine', dur: 0.55, vol: 0.06, delay: 0.38 });
    }),
  worldBossPhase: () =>
    play((ac) => {
      // 페이즈 돌파 징 — 팡파레 어택이 지난 뒤(0.5s) 낮은 배음 4개가 길게 울린다(샘플로 바꿀 땐 파일에 같은 여백을 둔다).
      noise(ac, { dur: 0.05, vol: 0.1, filter: 'bandpass', freq: 900, q: 0.6, delay: 0.5 });
      [147, 220, 294, 441].forEach((f, i) => tone(ac, { freq: f, type: 'sine', dur: 1.1 - i * 0.15, vol: 0.12 - i * 0.02, delay: 0.5, attack: 0.01 }));
      tone(ac, { freq: 1176, type: 'sine', dur: 0.6, vol: 0.03, delay: 0.5 });
    }),
  meleeVictory: () =>
    play((ac) => {
      // 챔피언 팡파레 — 브라스풍(saw) 상승 + 밝은 지속음.
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(ac, { freq: f, type: 'sawtooth', dur: 0.2, vol: 0.1, delay: i * 0.07 }),
      );
      tone(ac, { freq: 1047, type: 'triangle', dur: 0.45, vol: 0.12, delay: 0.28 });
      tone(ac, { freq: 1568, type: 'sine', dur: 0.4, vol: 0.08, delay: 0.3 });
    }),

  // 보상/알림 (범위 외 — 간단 유지)
  coin: () =>
    play((ac) => {
      tone(ac, { freq: 988, type: 'square', dur: 0.05, vol: 0.12 });
      tone(ac, { freq: 1319, type: 'square', dur: 0.1, vol: 0.12, delay: 0.05 });
    }),
  levelup: () =>
    play((ac) =>
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(ac, { freq: f, type: 'triangle', dur: 0.16, vol: 0.12, delay: i * 0.06 }),
      ),
    ),
  reward: () =>
    play((ac) =>
      [523, 784, 1047].forEach((f, i) =>
        tone(ac, { freq: f, type: 'sine', dur: 0.18, vol: 0.13, delay: i * 0.07 }),
      ),
    ),
  tap: () => play((ac) => tone(ac, { freq: 880, type: 'triangle', dur: 0.04, vol: 0.08 })),
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
  click: voice('click', synth.click),
  toggle: voice('toggle', synth.toggle),
  error: voice('error', synth.error),
  // 강화
  enhanceSuccess: voice('enhance-success', synth.enhanceSuccess),
  enhanceJackpot: voice('enhance-jackpot', synth.enhanceJackpot),
  enhanceKeep: voice('enhance-keep', synth.enhanceKeep),
  enhanceDown: voice('enhance-down', synth.enhanceDown),
  // 보급
  gachaOpen: voice('gacha-open', synth.gachaOpen),
  gachaReveal: voice('gacha-reveal', synth.gachaReveal),
  // 전투 — 레이드
  raidHit: voice('raid-hit', synth.raidHit),
  raidCrit: voice('raid-crit', synth.raidCrit),
  raidBlock: voice('raid-block'),
  raidVictory: voice('raid-victory', synth.meleeVictory),
  // 전투 — 대난투
  meleeHit: voice('melee-hit', synth.meleeHit),
  meleeKo: voice('melee-ko', synth.meleeKo),
  meleeVictory: voice('melee-victory', synth.meleeVictory),
  towerEnrage: voice('tower-enrage', synth.towerEnrage),
  // 전투 — 월드보스
  worldBossRoar: voice('world-boss-roar', synth.worldBossRoar),
  worldBossDepart: voice('world-boss-depart', synth.worldBossDepart),
  worldBossHit: voice('world-boss-hit', synth.worldBossHit),
  worldBossWeak: voice('world-boss-weak', synth.worldBossWeak),
  worldBossSweep: voice('world-boss-sweep', synth.worldBossSweep),
  worldBossLoot: voice('world-boss-loot', synth.worldBossLoot),
  worldBossJackpot: voice('world-boss-jackpot', synth.worldBossJackpot),
  worldBossVictory: voice('world-boss-victory', synth.worldBossVictory),
  worldBossPhase: voice('world-boss-phase', synth.worldBossPhase),
  // 보상/알림
  coin: voice('coin', synth.coin),
  gem: voice('gem', synth.coin),
  levelup: voice('levelup', synth.levelup),
  reward: voice('reward', synth.reward),
  // 하위호환 별칭 (기존 호출처 유지)
  rewardClaim: voice('reward', synth.reward),
  tap: voice('click', synth.tap),
};
