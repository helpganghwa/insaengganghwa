/**
 * 길드 문양 어휘 + 프롬프트 빌더 — GUILD §1.6. 고정 어휘(자유텍스트 없음 → 모더레이션 안전).
 * 축: 모양(1) · 컬러 메인/서브(각 1) · 키워드(카테고리별 0~1, 합계 ≥1).
 * 클라이언트 picker와 서버 생성이 공유(서버 의존 없는 순수 모듈).
 */

export type EmblemShape = { id: string; ko: string; en: string };
export type EmblemTone = { id: string; ko: string; en: string; color: string };
export type EmblemKeyword = { id: string; ko: string; en: string; cat: string };

/** ① 모양(1택) — 작은 픽셀 엠블럼에서 또렷하게 렌더되는 아이코닉한 실루엣만 선별. en = 프롬프트 힌트. */
export const EMBLEM_SHAPES: readonly EmblemShape[] = [
  { id: 'round', ko: '라운드 방패', en: 'a round shield' },
  { id: 'heater', ko: '기사 방패', en: 'a classic heater shield with a flat top and a pointed bottom' },
  { id: 'kite', ko: '카이트 방패', en: 'a tall pointed kite shield' },
  { id: 'wreath', ko: '월계관', en: 'a circular laurel wreath frame, two curved leafy branches meeting at the bottom and open in the center' },
  { id: 'medallion', ko: '원형 메달', en: 'a round medallion seal with a beaded rim' },
  { id: 'banner', ko: '전투 깃발', en: 'a hanging cloth war banner with a forked swallowtail bottom edge' },
  { id: 'lozenge', ko: '마름모', en: 'a diamond-shaped lozenge standing on one point' },
] as const;

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

/** ③ 키워드 테마(피커 탐색용 그룹핑). 선택은 메인 1 + 서브 0~1(테마 무관). */
export const EMBLEM_KEYWORD_CATEGORIES: readonly { id: string; ko: string }[] = [
  { id: 'kw1', ko: '생물' },
  { id: 'kw2', ko: '무기·장비' },
  { id: 'kw3', ko: '상징·자연' },
] as const;

/** ③ 키워드(16, 선별) — 메인·서브 공통 풀. cat은 피커 탐색용 테마. 작은 엠블럼에서 또렷한 아이코닉 모티브만. */
export const EMBLEM_KEYWORDS: readonly EmblemKeyword[] = [
  // 생물
  { id: 'dragon', ko: '용', en: 'a dragon', cat: 'kw1' },
  { id: 'wolf', ko: '늑대', en: 'a wolf', cat: 'kw1' },
  { id: 'lion', ko: '사자', en: 'a lion', cat: 'kw1' },
  { id: 'eagle', ko: '독수리', en: 'an eagle', cat: 'kw1' },
  { id: 'serpent', ko: '뱀', en: 'a serpent', cat: 'kw1' },
  { id: 'phoenix', ko: '불사조', en: 'a phoenix', cat: 'kw1' },
  // 무기·장비
  { id: 'swords', ko: '교차검', en: 'crossed swords', cat: 'kw2' },
  { id: 'axe', ko: '도끼', en: 'a battle axe', cat: 'kw2' },
  { id: 'spear', ko: '창', en: 'a spear', cat: 'kw2' },
  { id: 'helmet', ko: '투구', en: 'a knight helmet', cat: 'kw2' },
  { id: 'crown', ko: '왕관', en: 'a crown', cat: 'kw2' },
  // 상징·자연
  { id: 'skull', ko: '해골', en: 'a skull', cat: 'kw3' },
  { id: 'eye', ko: '눈', en: 'an eye', cat: 'kw3' },
  { id: 'crystal', ko: '크리스탈', en: 'a crystal', cat: 'kw3' },
  { id: 'flame', ko: '불꽃', en: 'a flame', cat: 'kw3' },
  { id: 'star', ko: '별', en: 'a star', cat: 'kw3' },
  { id: 'wings', ko: '날개', en: 'a pair of wings', cat: 'kw3' },
] as const;

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
  const shape = EMBLEM_SHAPES.find((x) => x.id === s.shapeId)!.en;
  const main = EMBLEM_TONES.find((x) => x.id === s.mainToneId)!.en;
  const sub = EMBLEM_TONES.find((x) => x.id === s.subToneId)!.en;
  const mainKw = keywordById(s.mainKeywordId)?.en ?? 'a heraldic beast';
  const subKw = s.subKeywordId ? keywordById(s.subKeywordId)?.en : null;
  const accent = subKw ? `, with ${subKw} as a small secondary accent` : '';
  return (
    `dark fantasy pixel art guild emblem shaped like ${shape}, ` +
    `${mainKw} as one bold central motif${accent}, ` +
    `${main} color palette with ${sub} accents, ` +
    `strong clean silhouette filling the frame, readable at small size, centered, transparent background, no text`
  );
}
