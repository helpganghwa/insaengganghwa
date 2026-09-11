/**
 * Play Console 인앱 상품 22종 일괄 등록 — docs/PLAYSTORE.md §4.
 *
 * 콘솔의 CSV 가져오기는 2025-05-19에 폐지돼 수기 입력 아니면 API뿐이다. 이 스크립트는
 * `lib/payment/play-sku.ts`의 `playSkuCatalog()`(코드 정본)를 그대로 등록해 표와 코드가 갈라지지 않게 한다.
 *
 * 전제: Vercel과 같은 서비스 계정 키가 로컬 env에 있어야 한다(`PLAY_SERVICE_ACCOUNT_JSON`,
 * `PLAY_PACKAGE_NAME`). 콘솔 사용자·권한에서 해당 서비스 계정에 **앱 정보 보기·재무 데이터 보기**
 * 권한이 있어야 inappproducts를 쓸 수 있다.
 *
 * 사용(⚠ `--conditions react-server` 필수 — play-api.ts가 'server-only'를 import한다. 그 조건에서만
 * 빈 모듈로 해석돼 스크립트에서 쓸 수 있고, 빼면 "cannot be imported from a Client Component"로 죽는다):
 *   bun --conditions react-server scripts/play-products.ts           # 대조만(기본, 아무것도 쓰지 않음)
 *   bun --conditions react-server scripts/play-products.ts --apply   # 누락분 생성
 *
 * ⚠ 제품 ID는 생성 후 변경·삭제가 불가하다. --apply 전에 대조 출력을 반드시 눈으로 확인할 것.
 * 이미 있는 SKU는 건드리지 않는다(가격·문구 수정은 콘솔에서 — 실수로 판매가를 덮어쓰지 않기 위함).
 */
import {
  createPlayInAppProduct,
  listPlayInAppProducts,
  playConfigured,
  playPackageName,
} from '@/lib/payment/play-api';
import { CASH, DIAMONDS, FIRST_SPECIAL, PREMIUM } from '@/lib/game/shop/catalog';
import { playSkuCatalog } from '@/lib/payment/play-sku';

const n = (v: number) => v.toLocaleString('ko-KR');

/** 콘솔 표시명·설명 — 설명은 '무엇을 얼마나 주는가' 한 줄(확률형 아님, 전부 확정 지급). */
function listing(sku: string, krw: number): { title: string; description: string } {
  for (const list of Object.values(CASH)) {
    for (const c of list) {
      if (sku === `cash_${c.id}`) {
        return {
          title: c.name,
          description: `다이아 ${n(c.diamond)}개와 보급 상자 ${n(c.boxes)}개를 즉시 지급합니다.`,
        };
      }
    }
  }
  for (const d of DIAMONDS) {
    if (sku === `dia_${d.id}`) {
      return { title: `다이아 ${n(d.total)}개`, description: `다이아 ${n(d.total)}개를 즉시 지급합니다.` };
    }
  }
  if (sku === 'premium') {
    const { instant, daily } = PREMIUM;
    return {
      title: '프리미엄 패키지',
      description:
        `구매 즉시 다이아 ${n(instant.diamond)}개와 보급 상자 ${n(instant.boxes)}개를 지급하고, ` +
        `이후 ${daily.days}일 동안 매일 다이아 ${n(daily.diamond)}개와 보급 상자 ${n(daily.boxes)}개를 우편으로 보내 드립니다.`,
    };
  }
  if (sku === 'first_special') {
    return {
      title: '인생 특가',
      description: `다이아 ${n(FIRST_SPECIAL.grant.diamond)}개와 보급 상자 ${n(FIRST_SPECIAL.grant.boxes)}개를 지급합니다. 서버당 한 번만 구매할 수 있습니다.`,
    };
  }
  if (sku.startsWith('bp_')) {
    return {
      title: `성장 패스 ${n(krw)}원`,
      description: '성장 패스의 한 구간을 해금합니다. 해금한 구간까지의 프리미엄 보상을 받을 수 있습니다.',
    };
  }
  throw new Error(`표시 문구가 정의되지 않은 SKU: ${sku}`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!playConfigured()) {
    console.error('PLAY_SERVICE_ACCOUNT_JSON이 없습니다. 서비스 계정 키를 로컬 env에 넣고 다시 실행하세요.');
    process.exit(1);
  }
  const want = playSkuCatalog().map((p) => ({ ...p, ...listing(p.sku, p.krw) }));
  const have = await listPlayInAppProducts();
  const bySku = new Map(have.map((p) => [p.sku, p]));

  console.log(`패키지 ${playPackageName()} · 코드 정본 ${want.length}종 · 콘솔 등록 ${have.length}종\n`);
  const missing: typeof want = [];
  for (const w of want) {
    const cur = bySku.get(w.sku);
    if (!cur) {
      missing.push(w);
      console.log(`누락  ${w.sku.padEnd(14)} ${String(n(w.krw)).padStart(7)}원  ${w.title}`);
      continue;
    }
    // 가격이 어긋나면 청약·공시가 갈라진다 — 고치지는 않고 알리기만 한다(판매가는 콘솔이 정본).
    const micros = cur.defaultPrice?.priceMicros;
    const mismatch = micros && micros !== String(BigInt(w.krw) * 1_000_000n);
    console.log(
      `있음  ${w.sku.padEnd(14)} ${String(n(w.krw)).padStart(7)}원  ${cur.status ?? '?'}` +
        (mismatch ? `  ⚠ 콘솔 가격 다름(${micros} micros)` : ''),
    );
  }
  const extra = have.filter((p) => !want.some((w) => w.sku === p.sku));
  for (const e of extra) console.log(`코드에 없음  ${e.sku}  ⚠ 확인 필요`);

  if (!missing.length) {
    console.log('\n누락 없음.');
    return;
  }
  if (!apply) {
    console.log(`\n누락 ${missing.length}종. 생성하려면 --apply를 붙여 다시 실행하세요(제품 ID는 생성 후 변경 불가).`);
    return;
  }
  for (const m of missing) {
    await createPlayInAppProduct(m);
    console.log(`생성  ${m.sku}  ${m.title}`);
  }
  console.log(`\n${missing.length}종 생성 완료. 콘솔에서 가격·문구를 확인하세요.`);
}

await main();
