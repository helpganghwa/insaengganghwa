/**
 * 카탈로그 단일 진실 원천 — 아이템 식별/로어/스프라이트.
 *
 * 한 배열이 다음을 모두 공급한다:
 *  - DB 시드 (`scripts/seed-catalog.ts`, `catalogItems`)
 *  - 스프라이트 파이프라인 프롬프트 (`scripts/sprite-pipeline.ts`)
 *  - 도감/인벤토리/공유 UI 표시명
 *  - 확률 공시 슬롯별 종 수
 *
 * 규칙 (GDD §3.1 / docs/LORE.md):
 *  - 등급·희소성·성능 차등 **없음**. 아이템 차이는 외관·도감·로어뿐.
 *  - `key`: 영문 snake. `public/sprites/<slot>/<key>.png` 파일명 = `catalogItems.code`(seed에서 code = key).
 *  - `lore`: 보스 스토리 톤(장엄·서사·간결). 등급/성능 표현 금지. (길이 가이드는 docs/LORE.md 참조)
 *  - `art`: Pixellab 64×64 생성 키워드(형태·재질·색·분위기). 글로우/등급 제외(GDD §6 — 코드가 강화 글로우 부여).
 *  - 세계관 연결은 느슨하게(~40%): region 이 5권역이면 보스의 땅과 엮임, '자유'면 권역 무관.
 *
 * 현재: 슬롯당 36종(무기/방어구/장신구 = 108), 이후 가변 추가(GDD §10).
 */

export type CatalogSlot = 'weapon' | 'armor' | 'accessory';

export type CatalogRegion =
  | '왕국'
  | '늪지대'
  | '화산'
  | '신전'
  | '타락천사'
  | '오크 부락'
  | '고대 룬 산맥'
  | '서쪽 화산'
  | '일반';

/** 로어 정서 — 배치 내 고르게 분포(한 톤이 슬롯의 ~1/4 초과 금지). docs/LORE.md §1.
 *  2026-05-23: catalog-next 신규 워크플로에서는 '담백'·'일상'·'정밀' 사용 금지,
 *  '전설'·'화려'·'아름다운'·'희망'으로 대체. 기존 catalog.ts entries는 enum 호환을 위해 옛 톤 유지.
 *  기괴·비애 빈도는 다른 톤보다 적게 (각 ~10%). */
export type CatalogTone =
  | '장엄'
  | '담백'
  | '위트'
  | '비애'
  | '기괴'
  | '일상'
  | '영웅담'
  | '수수께끼'
  | '전설'
  | '화려'
  | '아름다운'
  | '희망';

export interface CatalogItem {
  /** 영문 snake — 스프라이트 파일/스프라이트키 식별자. 전역 유니크. */
  key: string;
  slot: CatalogSlot;
  /** 한국어 표시명 (도감/인벤토리/공유). */
  nameKo: string;
  region: CatalogRegion;
  /** 로어 정서(다양성 강제용). docs/LORE.md §1. 최종 108종은 미지정(옵셔널). */
  tone?: CatalogTone;
  /** 한국어 로어 (~120~260자, 2~4문장). 아이템마다 고유 사연·개성. 등급/성능 언급 금지. */
  lore: string;
  /** Pixellab 64×64 생성 키워드 (영문, 글로우/등급 제외). */
  art: string;
  /** 아바타 합성용 '착용/장착 외형' 사전 묘사(영문·간결·성별중립). compose가 결정론적 조립에 사용. */
  wornDesc?: string;
}

// 카탈로그 단일 source — 3차 60종(catalog-v3.ts). 목표 120종의 전반부.
// (구 108종 catalog-next.ts는 보존하되 미사용 — 향후 120 확장 시 참고/병합용.)
import { CATALOG_V3 } from './catalog-v3';

export const CATALOG_ITEMS: CatalogItem[] = CATALOG_V3;
