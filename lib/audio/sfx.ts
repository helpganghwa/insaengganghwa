'use client';

// 효과음(SFX) 파일 재생 매니저 — Web Audio 버퍼 풀로 저지연 재생(클릭 반응성).
// ElevenLabs/jsfxr로 만든 샘플을 public/audio/sfx/<name>.webm 에 두면 자동 적용된다.
// 파일이 없으면 'missing'을 반환 → 호출측(lib/game/sound.ts 파사드)이 8-bit 합성음으로 폴백.
// 토글: BGM과 별개인 효과음 토글 localStorage 'ig:sound'. 값이 없으면 켜짐(기본 ON).
// 자동재생 정책: AudioContext는 첫 사용자 제스처 후 resume — playSfx/unlockSfx 모두 제스처 맥락에서 호출.

const STORAGE_KEY = 'ig:sound';
const BASE = '/audio/sfx';
const SFX_VOLUME = 0.85; // 효과음 기준 음량(전경). BGM(0.35)보다 충분히 높게 — 또렷하게 들리도록.
const EXT = 'webm'; // 작은 용량·넓은 지원. m4a로 바꾸려면 여기 + 파일 확장자만 교체.

export type SfxName =
  // UI
  | 'click'
  | 'toggle'
  | 'error'
  // 강화 (결과별 차등)
  | 'enhance-start'
  | 'enhance-success'
  | 'enhance-jackpot'
  | 'enhance-keep'
  | 'enhance-down'
  // 보급/가챠
  | 'gacha-open'
  | 'gacha-reveal'
  // 전투 — 레이드
  | 'raid-hit'
  | 'raid-crit'
  | 'raid-block'
  | 'raid-victory'
  // 전투 — 대난투
  | 'melee-hit'
  | 'melee-ko'
  | 'melee-victory'
  // 보상/알림
  | 'coin'
  | 'gem'
  | 'levelup'
  | 'reward';

// 효과별 상대 게인 — 샘플 음량 편차 보정 + 잦은 UI음은 낮춰 피로 방지.
const GAIN: Partial<Record<SfxName, number>> = {
  click: 0.45,
  toggle: 0.45,
  error: 0.55,
  coin: 0.7,
};

let ctx: AudioContext | null = null;
// 값: AudioBuffer = 적재됨 / null = 파일 없음(재시도 안 함) / undefined(키 없음) = 미시도.
const buffers = new Map<SfxName, AudioBuffer | null>();
const loading = new Map<SfxName, Promise<AudioBuffer | null>>();

export type PlayResult = 'played' | 'missing' | 'pending' | 'disabled';

/** 공유 AudioContext — 합성음 폴백(lib/game/sound.ts)도 이걸 재사용해 컨텍스트 1개만 유지. */
export function getAudioContext(): AudioContext | null {
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

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '0'; // 기본 ON (값 없으면 켜짐)
}

function load(name: SfxName): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = loading.get(name);
  if (inflight) return inflight;
  const audioCtx = getAudioContext();
  if (!audioCtx) return Promise.resolve(null);
  const p = fetch(`${BASE}/${name}.${EXT}`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('404'))))
    .then((buf) => audioCtx.decodeAudioData(buf))
    .then((b) => {
      buffers.set(name, b);
      loading.delete(name);
      return b;
    })
    .catch(() => {
      buffers.set(name, null); // 파일 없음 → 이후 'missing'으로 합성음 폴백
      loading.delete(name);
      return null;
    });
  loading.set(name, p);
  return p;
}

function fire(audioCtx: AudioContext, buf: AudioBuffer, gain: number): void {
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(audioCtx.destination);
  src.start();
}

/**
 * 효과음 재생. 파일이 적재돼 있으면 즉시 재생('played'), 없으면 'missing'(합성음 폴백 유도),
 * 아직 미적재면 백그라운드 로드만 걸고 'pending'(이번엔 폴백, 다음 호출부터 즉시 재생).
 * 토글 꺼짐이면 'disabled'(폴백도 안 함).
 */
export function playSfx(name: SfxName, opts?: { volume?: number }): PlayResult {
  if (!enabled()) return 'disabled';
  const audioCtx = getAudioContext();
  if (!audioCtx) return 'missing';
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  const gain = SFX_VOLUME * (GAIN[name] ?? 1) * (opts?.volume ?? 1);
  const cached = buffers.get(name);
  if (cached === undefined) {
    void load(name);
    return 'pending';
  }
  if (cached === null) return 'missing';
  fire(audioCtx, cached, gain);
  return 'played';
}

/** 자주 쓰는 효과음 미리 디코딩 — 샘플 파일 배치 후 호출 권장(파일 없으면 트랙당 404 1회). */
export function preloadSfx(names: SfxName[]): void {
  for (const n of names) void load(n);
}

/** 첫 사용자 제스처 — AudioContext 생성·resume으로 첫 재생 지연을 없앤다. */
export function unlockSfx(): void {
  const audioCtx = getAudioContext();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}
