/**
 * 길드 문양 어휘 + 프롬프트 빌더 — GUILD §1.6. 고정 어휘(자유텍스트 없음 → 모더레이션 안전).
 * 축: 모양(1) · 컬러 메인/서브(각 1) · 키워드(카테고리별 0~1, 합계 ≥1).
 * 클라이언트 picker와 서버 생성이 공유(서버 의존 없는 순수 모듈).
 */

/** shield=true면 방패 계열(모델이 기본으로 방패를 그려도 OK). false면 방패가 아니어야 함(마름모·깃발). */
export type EmblemShape = { id: string; ko: string; en: string; shield: boolean };
export type EmblemTone = { id: string; ko: string; en: string; color: string };
export type EmblemKeyword = { id: string; ko: string; en: string; cat: string };

/** ① 모양(1택) — 작은 픽셀 엠블럼에서 또렷하게 렌더되는 아이코닉한 실루엣만 선별. en = 프롬프트 힌트. */
export const EMBLEM_SHAPES: readonly EmblemShape[] = [
  { id: 'round', ko: '라운드 방패', en: 'a round shield', shield: true },
  { id: 'heater', ko: '기사 방패', en: 'a classic heater shield with a flat top and a pointed bottom', shield: true },
  { id: 'banner', ko: '전투 깃발', en: 'a hanging cloth war banner with a forked swallowtail bottom edge', shield: false },
  { id: 'lozenge', ko: '마름모', en: 'a diamond-shaped lozenge (rhombus) standing on one point', shield: false },
] as const;

/** 방패 계열 모양인지(아니면 모델의 방패 기본값을 강제로 밀어내야 함). 미정의 id는 방패로 간주(안전). */
export function isShieldShape(shapeId: string): boolean {
  return EMBLEM_SHAPES.find((x) => x.id === shapeId)?.shield ?? true;
}

/** ② 색상톤(7). 메인·서브 각 1택. color = UI 악센트(메인색이 emblem_color로 저장). */
export const EMBLEM_TONES: readonly EmblemTone[] = [
  { id: 'crimson', ko: '핏빛 적', en: 'crimson blood-red', color: '#b91c1c' },
  { id: 'gold', ko: '황금', en: 'golden', color: '#d4a017' },
  { id: 'ocean', ko: '심해 청', en: 'deep ocean blue', color: '#1e40af' },
  { id: 'toxic', ko: '독성 녹', en: 'toxic green', color: '#4d7c0f' },
  { id: 'arcane', ko: '마력 보라', en: 'arcane purple', color: '#7c3aed' },
  { id: 'iron', ko: '흑철', en: 'dark iron black', color: '#3f3f46' },
  { id: 'silver', ko: '백은', en: 'silver white', color: '#94a3b8' },
] as const;

/** ③ 키워드 테마 그룹 — 동물/무기/상징/자연. 메인은 전 그룹 노출, 서브는 메인과 다른 그룹만. */
export const EMBLEM_KEYWORD_CATEGORIES: readonly { id: string; ko: string }[] = [
  { id: 'kw1', ko: '동물' },
  { id: 'kw2', ko: '무기' },
  { id: 'kw3', ko: '상징' },
  { id: 'kw4', ko: '자연' },
] as const;

/** ③ 키워드(25) — 메인·서브 공통 풀. cat은 테마 그룹. 작은 엠블럼에서 또렷한 아이코닉 모티브만. */
export const EMBLEM_KEYWORDS: readonly EmblemKeyword[] = [
  // 동물
  { id: 'dragon', ko: '용', en: 'a dragon', cat: 'kw1' },
  { id: 'wolf', ko: '늑대', en: 'a wolf', cat: 'kw1' },
  { id: 'lion', ko: '사자', en: 'a lion', cat: 'kw1' },
  { id: 'eagle', ko: '독수리', en: 'an eagle', cat: 'kw1' },
  { id: 'serpent', ko: '뱀', en: 'a serpent', cat: 'kw1' },
  { id: 'phoenix', ko: '불사조', en: 'a phoenix', cat: 'kw1' },
  { id: 'bear', ko: '곰', en: 'a bear', cat: 'kw1' },
  { id: 'tiger', ko: '호랑이', en: 'a tiger', cat: 'kw1' },
  { id: 'raven', ko: '까마귀', en: 'a raven', cat: 'kw1' },
  { id: 'bull', ko: '황소', en: 'a bull head with large curved horns', cat: 'kw1' },
  { id: 'scorpion', ko: '전갈', en: 'a scorpion', cat: 'kw1' },
  // 무기
  { id: 'axe', ko: '도끼', en: 'a battle axe', cat: 'kw2' },
  { id: 'spear', ko: '창', en: 'a spear', cat: 'kw2' },
  { id: 'trident', ko: '삼지창', en: 'a trident', cat: 'kw2' },
  // 상징
  { id: 'crown', ko: '왕관', en: 'a crown', cat: 'kw3' },
  { id: 'skull', ko: '해골', en: 'a skull', cat: 'kw3' },
  { id: 'star', ko: '별', en: 'a star', cat: 'kw3' },
  { id: 'wings', ko: '날개', en: 'a pair of wings', cat: 'kw3' },
  { id: 'flame', ko: '불꽃', en: 'a flame', cat: 'kw3' },
  { id: 'lightning', ko: '번개', en: 'a lightning bolt', cat: 'kw3' },
  { id: 'crescent', ko: '초승달', en: 'a crescent moon', cat: 'kw3' },
  { id: 'sun', ko: '태양', en: 'a sun', cat: 'kw3' },
  // 자연
  { id: 'tree', ko: '세계수', en: 'a great tree', cat: 'kw4' },
  { id: 'rose', ko: '장미', en: 'a rose', cat: 'kw4' },
  { id: 'feather', ko: '깃털', en: 'a feather', cat: 'kw4' },
] as const;

/**
 * 서브(2차) 키워드 풀 — 메인과 **다른 그룹**의 키워드만(동물 메인 → 무기·상징·자연).
 * 같은 그룹끼리(예: 용+늑대) 중복 모티브를 막아 문장 구성이 또렷하게. 서브는 미선택도 가능.
 */
export function subKeywordsFor(mainId: string): EmblemKeyword[] {
  const main = EMBLEM_KEYWORDS.find((k) => k.id === mainId);
  if (!main) return [];
  return EMBLEM_KEYWORDS.filter((k) => k.cat !== main.cat);
}

export type EmblemSelection = {
  shapeId: string;
  mainToneId: string;
  subToneId: string;
  /** 메인 키워드(필수, 중앙 주모티브). */
  mainKeywordId: string;
  /** 서브 키워드(선택, 작은 악센트). 없으면 null. */
  subKeywordId: string | null;
};

const keywordById = (id: string) => EMBLEM_KEYWORDS.find((x) => x.id === id);

/** 선택 유효성 — 모양·메인/서브톤·메인 키워드 존재, 서브는 null이거나 (존재 & 메인과 다름). */
export function isValidEmblemSelection(s: EmblemSelection): boolean {
  if (!EMBLEM_SHAPES.some((x) => x.id === s.shapeId)) return false;
  if (!EMBLEM_TONES.some((x) => x.id === s.mainToneId)) return false;
  if (!EMBLEM_TONES.some((x) => x.id === s.subToneId)) return false;
  if (s.mainToneId === s.subToneId) return false; // 메인·서브 색은 달라야 함(2색 팔레트)
  if (!keywordById(s.mainKeywordId)) return false;
  if (s.subKeywordId != null) {
    if (!keywordById(s.subKeywordId)) return false;
    if (s.subKeywordId === s.mainKeywordId) return false;
  }
  return true;
}

/** 메인 톤의 UI 악센트 색(emblem_color). 없으면 null. */
export function mainColor(mainToneId: string): string | null {
  return EMBLEM_TONES.find((t) => t.id === mainToneId)?.color ?? null;
}

/**
 * 선택 → 검증된 프롬프트(§1.6). 고정 스타일 앵커(픽셀아트·외곽 추종 테두리·중앙 단일 모티브·프레임 채움).
 * 컬러는 메인 팔레트 + 서브 악센트 2톤.
 */
export function buildEmblemPrompt(s: EmblemSelection): string {
  const shapeDef = EMBLEM_SHAPES.find((x) => x.id === s.shapeId)!;
  const shape = shapeDef.en;
  const main = EMBLEM_TONES.find((x) => x.id === s.mainToneId)!.en;
  const sub = EMBLEM_TONES.find((x) => x.id === s.subToneId)!.en;
  const mainKw = keywordById(s.mainKeywordId)?.en ?? 'a heraldic beast';
  const subKw = s.subKeywordId ? keywordById(s.subKeywordId)?.en : null;
  const palette =
    `mostly a ${main} and ${sub} palette with these two colors dominating, ${main} field with ${sub} accents and trim, ` +
    `highly detailed intricate filigree and fine engraved linework, rich metallic shading and embossed relief, ` +
    `bold clean silhouette filling the frame, centered, dark fantasy, transparent background, no text`;

  // 방패 계열(라운드·기사 방패) — 정통 문장(紋章) 프레이밍 유지(모델 기본값과 일치).
  if (shapeDef.shield) {
    const accent = subKw ? `, flanked by ${subKw} as a clearly visible secondary heraldic charge` : '';
    return (
      `pixel art medieval heraldic coat of arms, an old family guild crest shaped like ${shape}, ` +
      `${mainKw} as the bold central heraldic charge${accent}, ornate symmetrical vintage emblem, ${palette}`
    );
  }

  // 비방패(마름모·깃발) — "heraldic / coat of arms / crest / shield" 단어를 일절 쓰지 않는다.
  // 모델이 그 단어를 보면 거의 항상 방패를 그리기 때문(검증됨). 모양을 맨 앞에 두고 반복 강조 +
  // 방패류를 명시 배제. AI 재작성도 비방패는 건너뛰고 이 템플릿을 직접 사용한다(emblem.ts).
  const accent = subKw ? `, with ${subKw} as a clearly visible secondary figure` : '';
  return (
    `pixel art emblem shaped exactly as ${shape}, the whole badge outline is ${shape}, ` +
    `NOT a shield, not a coat of arms, not an escutcheon, not a crest, ` +
    `${mainKw} as the large bold central figure${accent}, ornate symmetrical vintage insignia, ${palette}`
  );
}
