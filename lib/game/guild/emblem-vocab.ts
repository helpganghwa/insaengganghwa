/**
 * 길드 문양 어휘 + 프롬프트 빌더 — GUILD §1.6. 고정 어휘(자유텍스트 없음 → 모더레이션 안전).
 * 축: 모양(1) · 컬러 메인/서브(각 1) · 키워드(카테고리별 0~1, 합계 ≥1).
 * 클라이언트 picker와 서버 생성이 공유(서버 의존 없는 순수 모듈).
 */

export type EmblemShape = { id: string; ko: string; en: string; svg: string };
export type EmblemTone = { id: string; ko: string; en: string; color: string };
export type EmblemKeyword = { id: string; ko: string; en: string; cat: string };

/** ① 모양(1택, 6). svg = 24×24 viewBox 대략 실루엣(picker 미리보기). en = 생성 프롬프트용 단정 묘사. */
export const EMBLEM_SHAPES: readonly EmblemShape[] = [
  { id: 'round', ko: '라운드 방패', en: 'a round shield', svg: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z' },
  { id: 'kite', ko: '카이트 방패', en: 'a tall narrow pointed kite shield', svg: 'M12 2 18 6 16 14 12 22 8 14 6 6Z' },
  {
    id: 'banner',
    ko: '전쟁 깃발',
    en: 'a hanging rectangular cloth war banner with a forked swallowtail bottom edge, not a shield',
    svg: 'M5 3H19V15L15.5 12 12 17 8.5 12 5 15Z',
  },
  {
    id: 'plaque',
    ko: '사각 문장판',
    en: 'a flat square stone heraldic plaque with straight edges, not a shield',
    svg: 'M5 4H19V20H5Z',
  },
  {
    id: 'winged',
    ko: '날개 문장',
    en: 'a shield flanked by a pair of large spread feathered wings',
    svg: 'M12 5 16 6.5V13L12 20 8 13V6.5Z M8 7 2 8 7 11Z M16 7 22 8 17 11Z',
  },
  { id: 'lozenge', ko: '마름모', en: 'a diamond-shaped lozenge standing on one point', svg: 'M12 2 21 12 12 22 3 12Z' },
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

/** ③ 키워드 그룹 — 그룹별 0~1 선택, 합계 ≥1. */
export const EMBLEM_KEYWORD_CATEGORIES: readonly { id: string; ko: string }[] = [
  { id: 'kw1', ko: '키워드 1' },
  { id: 'kw2', ko: '키워드 2' },
  { id: 'kw3', ko: '키워드 3' },
] as const;

/** ③ 키워드(30) — 그룹(cat)별 10개. 키워드1=생물 / 키워드2=무기·장비 / 키워드3=상징·자연. */
export const EMBLEM_KEYWORDS: readonly EmblemKeyword[] = [
  // 키워드 1 — 생물
  { id: 'dragon', ko: '용', en: 'a dragon', cat: 'kw1' },
  { id: 'wolf', ko: '늑대', en: 'a wolf', cat: 'kw1' },
  { id: 'serpent', ko: '뱀', en: 'a serpent', cat: 'kw1' },
  { id: 'raven', ko: '까마귀', en: 'a raven', cat: 'kw1' },
  { id: 'griffin', ko: '그리핀', en: 'a griffin', cat: 'kw1' },
  { id: 'lion', ko: '사자', en: 'a lion', cat: 'kw1' },
  { id: 'phoenix', ko: '불사조', en: 'a phoenix', cat: 'kw1' },
  { id: 'eagle', ko: '독수리', en: 'an eagle', cat: 'kw1' },
  { id: 'bear', ko: '곰', en: 'a bear', cat: 'kw1' },
  { id: 'slime', ko: '슬라임', en: 'a slime', cat: 'kw1' },
  // 키워드 2 — 무기·장비
  { id: 'swords', ko: '교차검', en: 'crossed swords', cat: 'kw2' },
  { id: 'axe', ko: '도끼', en: 'a battle axe', cat: 'kw2' },
  { id: 'spear', ko: '창', en: 'a spear', cat: 'kw2' },
  { id: 'bow', ko: '활', en: 'a bow', cat: 'kw2' },
  { id: 'hammer', ko: '전투 망치', en: 'a war hammer', cat: 'kw2' },
  { id: 'dagger', ko: '단검', en: 'a dagger', cat: 'kw2' },
  { id: 'helmet', ko: '투구', en: 'a knight helmet', cat: 'kw2' },
  { id: 'gauntlet', ko: '건틀릿', en: 'an armored gauntlet', cat: 'kw2' },
  { id: 'crown', ko: '왕관', en: 'a crown', cat: 'kw2' },
  { id: 'warbanner', ko: '전투 깃발', en: 'a war banner', cat: 'kw2' },
  // 키워드 3 — 상징·자연
  { id: 'skull', ko: '해골', en: 'a skull', cat: 'kw3' },
  { id: 'eye', ko: '눈', en: 'an eye', cat: 'kw3' },
  { id: 'crystal', ko: '크리스탈', en: 'a crystal', cat: 'kw3' },
  { id: 'starmoon', ko: '별·달', en: 'a star and moon', cat: 'kw3' },
  { id: 'thunder', ko: '번개', en: 'a lightning bolt', cat: 'kw3' },
  { id: 'flame', ko: '불꽃', en: 'a flame', cat: 'kw3' },
  { id: 'volcano', ko: '화산', en: 'a volcano', cat: 'kw3' },
  { id: 'wings', ko: '천사 날개', en: 'angel wings', cat: 'kw3' },
  { id: 'totem', ko: '오크 토템', en: 'an orc totem', cat: 'kw3' },
  { id: 'temple', ko: '신전', en: 'a temple', cat: 'kw3' },
] as const;

export type EmblemSelection = {
  shapeId: string;
  mainToneId: string;
  subToneId: string;
  keywordIds: string[];
};

const keywordById = (id: string) => EMBLEM_KEYWORDS.find((x) => x.id === id);

/** 선택 유효성 — 모양·메인/서브톤 존재, 키워드 ≥1 & 카테고리당 최대 1. */
export function isValidEmblemSelection(s: EmblemSelection): boolean {
  if (!EMBLEM_SHAPES.some((x) => x.id === s.shapeId)) return false;
  if (!EMBLEM_TONES.some((x) => x.id === s.mainToneId)) return false;
  if (!EMBLEM_TONES.some((x) => x.id === s.subToneId)) return false;
  const uniq = [...new Set(s.keywordIds)];
  if (uniq.length < 1) return false;
  const cats = uniq.map((k) => keywordById(k)?.cat);
  if (cats.some((c) => c == null)) return false; // 존재하지 않는 키워드
  if (new Set(cats).size !== cats.length) return false; // 카테고리 중복 = 카테고리당 1개 초과
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
  const kws = [...new Set(s.keywordIds)]
    .map((k) => keywordById(k)?.en)
    .filter(Boolean)
    .join(', ');
  return (
    `dark fantasy pixel art guild emblem, the overall shape is ${shape}, ` +
    `in a ${main} color palette with ${sub} accents, ` +
    `featuring ${kws} as a single bold central symmetrical motif, an ornate border that traces the outer silhouette of the shape, ` +
    `the emblem is large and fills the entire frame edge to edge with minimal empty margin, ` +
    `clean strong silhouette, bold and readable at small sizes, centered, transparent background, no text`
  );
}
