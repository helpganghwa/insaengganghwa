/**
 * Apple 인앱 상품 ID 매핑 — docs/APPSTORE.md §2-5 / PLAYSTORE.md §4. 순수 모듈.
 *
 * App Store Connect 상품 ID는 **Play SKU와 같은 문자열**을 쓴다(cash_d1 · dia_starter · premium ·
 * first_special · bp_9900 …, 22종). 상품 ID는 가격만 담당하고 지급은 주문(product_code)이 정한다는
 * 규칙도 동일. 콘솔 등록가는 카탈로그 KRW(부가세 포함)와 같아야 한다.
 */
export { playSkuFor as appleProductIdFor, playSkuCatalog as appleProductCatalog } from './play-sku';
