'use client';

// 배경음(BGM) 매니저 — 효과음(sfx.ts)과 같은 구조: 파일이 있으면 그걸 루프 재생,
// 없으면 Web Audio 합성 앰비언트로 폴백(외부 도구·파일 없이도 소리가 난다).
// 파일 위치: public/audio/bgm/<track>.m4a (없으면 .webm → .mp3 순서로 시도)
//
// 토글: localStorage 'ig:bgm' — **기본 OFF**('1'일 때만 켜짐). 효과음(기본 ON)과 반대다 —
// 배경음은 강제 노출이 피로하므로 유저가 설정에서 직접 켠 기기에서만 재생한다.
// 예외: CBT 종료 화면처럼 연출이 목적인 화면은 설정과 무관하게 재생(BgmPlayer force).
//
// 자동재생 정책: 브라우저는 제스처 전 소리 재생을 막는다 — playBgm은 컨텍스트가
// running일 때만 시작하고 성공 여부를 반환한다. 제스처 폴백은 BgmPlayer가 담당.

import { getAudioContext } from '@/lib/audio/sfx';

export const BGM_STORAGE_KEY = 'ig:bgm';
/** 같은 탭에서 설정 토글 → 재생 컴포넌트 실시간 반영용 커스텀 이벤트. */
export const BGM_EVENT = 'ig:bgm-change';

/** 트랙 이름 = 파일 이름(public/audio/bgm/<track>.*). 합성 폴백은 트랙별 매핑. */
export type BgmTrack = 'forge-dawn';

const FILE_BASE = '/audio/bgm';
const FILE_EXTS = ['m4a', 'webm', 'mp3'] as const;
const FILE_GAIN = 0.24; // 파일 트랙 기준 음량(배경) — 효과음(0.85)보다 한참 낮게.
// 페이드인은 짧게 — 곡에 의도된 도입부가 있어 길게 물리면 앞부분이 먹힌다(2026-07-31 청취).
const FADE_IN_S = 0.6;
const FADE_OUT_S = 0.8;

export function bgmEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(BGM_STORAGE_KEY) === '1'; // 기본 OFF
}

// ── 재생 상태 ───────────────────────────────────────────────────────────────
type Handle = { track: BgmTrack; stop: (fadeS: number) => void };
let current: Handle | null = null;
let starting = 0; // 재진입 가드 토큰 — 연타/이벤트 중복으로 이중 재생 방지

export function isBgmPlaying(): boolean {
  return current != null;
}

export function stopBgm(fadeS = FADE_OUT_S): void {
  starting++; // 진행 중이던 시작 시도 무효화
  const h = current;
  current = null;
  h?.stop(fadeS);
}

/**
 * 재생 시작 — 이미 같은 트랙이면 no-op(true). 컨텍스트가 제스처 전(suspended)이면
 * resume을 시도하고, 그래도 못 열면 false — 호출측(BgmPlayer)이 제스처를 기다린다.
 */
export async function playBgm(track: BgmTrack): Promise<boolean> {
  if (current?.track === track) return true;
  const ac = getAudioContext();
  if (!ac) return false;
  if (ac.state === 'suspended') await ac.resume().catch(() => undefined);
  if (ac.state !== 'running') return false;

  const token = ++starting;
  stopBgm(0.3);
  starting = token; // stopBgm의 토큰 증가를 되돌려 이 시도를 유효하게 유지

  // 마스터 — sfx의 부스트 체인(x2.6+리미터)을 타지 않고 목적지 직결(배경은 조용해야 한다).
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.gain.exponentialRampToValueAtTime(1, ac.currentTime + FADE_IN_S);
  out.connect(ac.destination);

  const stopWith = (inner: () => void): Handle['stop'] => (fadeS: number) => {
    const t = ac.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fadeS));
    setTimeout(() => {
      inner();
      out.disconnect();
    }, (fadeS + 0.1) * 1000);
  };

  const buf = await loadTrackFile(ac, track);
  if (starting !== token) {
    out.disconnect();
    return false; // 로드 중 stop/재요청 발생 — 이 시도는 폐기
  }

  if (buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ac.createGain();
    g.gain.value = FILE_GAIN;
    src.connect(g).connect(out);
    src.start();
    current = {
      track,
      stop: stopWith(() => {
        try {
          src.stop();
        } catch {
          /* 이미 정지 */
        }
      }),
    };
    return true;
  }

  const stopSynth = startForgeDawnSynth(ac, out);
  current = { track, stop: stopWith(stopSynth) };
  return true;
}

// ── 파일 로드(캐시) ─────────────────────────────────────────────────────────
const fileCache = new Map<BgmTrack, AudioBuffer | null>();

async function loadTrackFile(ac: AudioContext, track: BgmTrack): Promise<AudioBuffer | null> {
  if (fileCache.has(track)) return fileCache.get(track) ?? null;
  for (const ext of FILE_EXTS) {
    try {
      const res = await fetch(`${FILE_BASE}/${track}.${ext}`);
      if (!res.ok) continue;
      const buf = await ac.decodeAudioData(await res.arrayBuffer());
      fileCache.set(track, buf);
      return buf;
    } catch {
      /* 다음 확장자 */
    }
  }
  fileCache.set(track, null); // 없음 확정 — 매 재생마다 404를 다시 밟지 않게
  return null;
}

// ── 합성 폴백: forge-dawn — 불 꺼진 새벽의 대장간 ──────────────────────────
// 저역 드론(잦아든 화덕) + 느린 코드 패드(8초/코드, Am 진행) + 바람(필터드 노이즈,
// LFO 호흡) + 드문 종소리(식어가는 쇠의 여운, A 펜타토닉). 전부 저음량 — 배경이다.

const BAR_S = 8;
const CHORDS: number[][] = [
  [110.0, 164.81, 246.94, 261.63], // Am9  (A2 E3 B3 C4)
  [87.31, 130.81, 164.81, 220.0], // Fmaj7 (F2 C3 E3 A3)
  [130.81, 196.0, 293.66, 329.63], // Cadd9 (C3 G3 D4 E4)
  [98.0, 146.83, 196.0, 246.94], // G     (G2 D3 G3 B3)
];
const BELLS = [440.0, 523.25, 587.33, 659.25, 783.99]; // A 펜타토닉 (A4 C5 D5 E5 G5)

function startForgeDawnSynth(ac: AudioContext, out: GainNode): () => void {
  const nodes: { stop?: () => void; disconnect: () => void }[] = [];

  // 드론 — A1 + 디튠 쌍(A2 ±4c)을 로우패스로 뭉갠 저역 바닥.
  const droneLp = ac.createBiquadFilter();
  droneLp.type = 'lowpass';
  droneLp.frequency.value = 320;
  droneLp.connect(out);
  for (const [freq, detune, vol] of [
    [55, 0, 0.05],
    [110, 4, 0.03],
    [110, -4, 0.03],
  ] as const) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ac.createGain();
    g.gain.value = vol;
    osc.connect(g).connect(droneLp);
    osc.start();
    nodes.push({ stop: () => osc.stop(), disconnect: () => g.disconnect() });
  }
  nodes.push({ disconnect: () => droneLp.disconnect() });

  // 바람 — 2초 노이즈 루프를 밴드패스로 좁히고, 초저속 LFO로 숨을 쉬게.
  const nLen = Math.floor(ac.sampleRate * 2);
  const nBuf = ac.createBuffer(1, nLen, ac.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
  const wind = ac.createBufferSource();
  wind.buffer = nBuf;
  wind.loop = true;
  const windBp = ac.createBiquadFilter();
  windBp.type = 'bandpass';
  windBp.frequency.value = 240;
  windBp.Q.value = 0.7;
  const windG = ac.createGain();
  windG.gain.value = 0.014;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = ac.createGain();
  lfoG.gain.value = 0.007;
  lfo.connect(lfoG).connect(windG.gain);
  wind.connect(windBp).connect(windG).connect(out);
  wind.start();
  lfo.start();
  nodes.push(
    { stop: () => wind.stop(), disconnect: () => windG.disconnect() },
    { stop: () => lfo.stop(), disconnect: () => lfoG.disconnect() },
  );

  // 패드/종 스케줄러 — 1초 간격으로 2초 앞까지 예약(백그라운드 스로틀에도 이음새 없음).
  let bar = 0;
  let nextBarT = ac.currentTime + 0.3;
  let nextBellT = ac.currentTime + 5 + Math.random() * 6;

  const scheduleChord = (t: number, freqs: number[]) => {
    for (const f of freqs) {
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 6;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 2.8); // 느린 어택
      g.gain.setValueAtTime(0.03, t + BAR_S - 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BAR_S + 3.5); // 다음 코드와 크로스페이드
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + BAR_S + 4);
      osc.onended = () => g.disconnect();
    }
  };

  const scheduleBell = (t: number) => {
    const f = BELLS[Math.floor(Math.random() * BELLS.length)];
    for (const [mult, vol] of [
      [1, 0.016],
      [2.01, 0.005], // 살짝 어긋난 배음 — 금속성 여운
    ] as const) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 3.4);
      osc.onended = () => g.disconnect();
    }
  };

  const timer = setInterval(() => {
    const horizon = ac.currentTime + 2;
    while (nextBarT < horizon) {
      scheduleChord(nextBarT, CHORDS[bar % CHORDS.length]);
      bar++;
      nextBarT += BAR_S;
    }
    while (nextBellT < horizon) {
      scheduleBell(nextBellT);
      nextBellT += 7 + Math.random() * 8;
    }
  }, 1000);

  return () => {
    clearInterval(timer);
    for (const n of nodes) {
      try {
        n.stop?.();
      } catch {
        /* 이미 정지 */
      }
      n.disconnect();
    }
  };
}
