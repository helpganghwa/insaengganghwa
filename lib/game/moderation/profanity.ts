import 'server-only';

import Filter from 'badwords-ko';
import { check as korcenCheck } from 'korcen';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/**
 * 한국어 + 영어 비속어 검사(서버 권위) — 닉네임·길드 이름/공지/소개 등 유저 작성 텍스트에 사용.
 *
 * 엔진 3종 병행(어느 하나라도 잡으면 비속어):
 *  - korcen: 한국어. 자모(ㅅㅂ)·띄어쓰기(시 발)·치환 난독화에 강함.
 *  - badwords-ko: 한국어 기본 비속어 사전(korcen이 놓치는 "씨발" 등 보완).
 *  - obscenity: 영어. leet/난독화 대응(권장 트랜스포머).
 * 정상 닉네임 오탐 0 확인(실측). 엔진 단일 오류는 무시하고 나머지에 위임.
 */
const koFilter = new Filter();
const enMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** 한국어/영어 비속어 포함 여부. 빈 문자열은 false. */
export function containsProfanity(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  try {
    if (korcenCheck(t) === true) return true;
  } catch {
    /* 엔진 오류 무시 — 나머지 엔진에 위임 */
  }
  try {
    if (koFilter.isProfane(t)) return true;
  } catch {
    /* 무시 */
  }
  try {
    if (enMatcher.hasMatch(t)) return true;
  } catch {
    /* 무시 */
  }
  return false;
}
