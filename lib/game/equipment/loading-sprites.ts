import { SPRITE_MANIFEST } from './sprite-manifest';

/**
 * 화면 이동 로딩용 스프라이트 풀 — **전체 150종**(grow식 랜덤 순환 다양성 최대).
 * SpritePreloader가 (game) 셸 마운트 시 이 배열 전부를 브라우저 캐시에 적재 →
 * 순환 교체가 네트워크 대기 없이 즉시. (64px 픽셀 PNG, 장당 ~수 KB — 1회 워밍 OK)
 * loading 오버레이와 SpritePreloader가 **같은 배열**을 써야 캐시 적중 보장.
 */
export const LOADING_SPRITES: string[] = Object.values(SPRITE_MANIFEST);
