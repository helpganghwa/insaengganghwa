// 스크립트용 Pixellab 키 선택(2026-09-19, key3 추가) — 로컬 .env.local의 키를 라벨(key1|key2|key3)로 고른다.
// 객체·캐릭터는 **만든 계정의 키로만** 애니·조회가 되므로, 생성 스크립트는 라벨을 obj-map에 함께 기록하고
// 후속 스크립트(gen-anim3 등)는 그 라벨로 같은 키를 다시 고른다. 서버 풀(lib/game/profile/pixellab-keys.ts)과
// 같은 env 이름을 쓴다 — 번호를 바꾸거나 재사용하지 말 것.
export type ScriptKeyLabel = 'key1' | 'key2' | 'key3';

const ENV_OF: Record<ScriptKeyLabel, string> = {
  key1: 'PIXELLAB_API_KEY',
  key2: 'PIXELLAB_API_KEY_2',
  key3: 'PIXELLAB_API_KEY_3',
};

/** GEN_KEY=1|2|3 → 라벨. 없으면 `fallback`(기존 스크립트 기본값 유지용). 이상값은 던진다(엉뚱한 계정 과금 방지). */
export function scriptKeyLabel(fallback: ScriptKeyLabel, raw: string | undefined = process.env.GEN_KEY): ScriptKeyLabel {
  if (raw == null || raw === '') return fallback;
  if (raw === '1' || raw === '2' || raw === '3') return `key${raw}` as ScriptKeyLabel;
  throw new Error(`GEN_KEY는 1·2·3 중 하나여야 한다(받은 값: ${raw})`);
}

/** 라벨 → 키 값(없으면 undefined). env 이름은 오류 메시지용으로 함께 준다. */
export function scriptKeyFor(label: ScriptKeyLabel): { key: string | undefined; envName: string } {
  const envName = ENV_OF[label];
  const v = process.env[envName];
  return { key: v && v.trim() ? v : undefined, envName };
}

/** obj-map 기록의 키 라벨 정규화 — 모르는 값·누락은 레거시 기본(key2). */
export function labelFromMap(v: string | undefined): ScriptKeyLabel {
  return v === 'key1' || v === 'key3' ? v : 'key2';
}
