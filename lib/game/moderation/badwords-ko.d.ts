// badwords-ko(1.0.4)는 타입 미제공 — 사용하는 API만 최소 선언.
declare module 'badwords-ko' {
  class Filter {
    constructor(options?: Record<string, unknown>);
    /** 비속어 포함 여부. */
    isProfane(text: string): boolean;
    /** 비속어를 placeHolder로 치환. */
    clean(text: string): string;
  }
  export = Filter;
}
