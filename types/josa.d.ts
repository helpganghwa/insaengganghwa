/**
 * josa(kimdhoe/josa) 타입 — 패키지에 d.ts가 없다. `josa('친구#{이} 학교#{으로}')`처럼
 * 문장 안 `#{조사}` 자리를 앞 단어의 받침에 맞게 채운다. 동적 명사 + 을/를·이/가·은/는·과/와·으로/로에 사용.
 */
declare module 'josa' {
  export function josa(sentence: string): string;
  export function getJosaPicker(josa: string): (word: string) => string;
  export function makeJosaify(josa: string): (word: string) => string;
}
