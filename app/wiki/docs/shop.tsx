import { BOX, CASH, DIAMONDS, FIRST_SPECIAL, PREMIUM, type Period } from '@/lib/game/shop/catalog';
import { FREE_REWARDS, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free-rewards';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'shop',
  cat: '계정',
  title: '상점',
  summary: '무료 수령과 주머니, 패키지와 충전.',
  sections: [
    { id: 'free', label: '무료 수령' },
    { id: 'box', label: '주머니' },
    { id: 'package', label: '패키지' },
    { id: 'charge', label: '충전' },
    { id: 'limited', label: '한정 상품' },
  ],
};

const PERIODS: readonly Period[] = ['daily', 'weekly', 'monthly'];
const TAB_KO: Record<Period, string> = { daily: '일일', weekly: '주간', monthly: '월간' };
/** 견습의 주머니 — 기간마다 이름이 다르다(상점 카드 표기와 같다). */
const BOX_NAME: Record<Period, string> = {
  daily: '견습의 작은 주머니',
  weekly: '견습의 주머니',
  monthly: '견습의 큰 주머니',
};
/** 무료 수령 슬롯이 놓인 탭과 초기화 시점. 수량은 FREE_REWARDS에서만 읽는다. */
const FREE_TAB: Record<FreeSlot, string> = {
  daily: '일일',
  weekly: '주간',
  monthly: '월간',
  signup: '충전',
};
const FREE_RESET: Record<FreeSlot, string> = {
  daily: '매일 자정',
  weekly: '매주 월요일',
  monthly: '매달 1일',
  signup: '가입 후 한 번',
};

const won = (krw: number) => `₩${fmtInt(krw)}`;

/** 지급 내역 한 줄 — 다이아·상자 수량은 전부 카탈로그 상수에서 파생한다. */
function grantText(g: { diamond: number; boxes: number }): string {
  const parts: string[] = [];
  if (g.diamond > 0) parts.push(`다이아 ${fmtInt(g.diamond)}`);
  if (g.boxes > 0) parts.push(`보급 상자 ${fmtInt(g.boxes)}개`);
  return parts.join(' · ');
}

export default function Doc() {
  return (
    <>
      <H2 id="free">무료 수령</H2>
      <Tbl
        head={['탭', '보상', '초기화']}
        firstColNowrap
        rows={FREE_SLOTS.map((s) => [FREE_TAB[s], grantText(FREE_REWARDS[s]), FREE_RESET[s]])}
      />

      <H2 id="box">주머니</H2>
      <UL>
        <LI>
          견습의 주머니는 다이아로 사는 <DocLink slug="supply" hash="boxes">보급 상자</DocLink>{' '}
          묶음이다.
        </LI>
      </UL>
      <Tbl
        head={['탭', '주머니', '다이아', '상자']}
        firstColNowrap
        rows={PERIODS.map((p) => [
          TAB_KO[p],
          BOX_NAME[p],
          fmtInt(BOX[p].cost),
          `${fmtInt(BOX[p].boxes)}개`,
        ])}
      />

      <H2 id="package">패키지</H2>
      <Tbl
        head={['탭', '상품', '가격', '받는 것']}
        firstColNowrap
        rows={PERIODS.flatMap((p) =>
          CASH[p].map((c) => [
            TAB_KO[p],
            c.name,
            won(c.krw),
            grantText({ diamond: c.diamond, boxes: c.boxes }),
          ]),
        )}
      />

      <H2 id="charge">충전</H2>
      <Tbl
        head={['다이아', '가격']}
        firstColNowrap
        rows={DIAMONDS.map((d) => [fmtInt(d.total), won(d.krw)])}
      />

      <H2 id="limited">한정 상품</H2>
      <UL>
        <LI>
          인생 특가는 {won(FIRST_SPECIAL.krw)}에 {grantText(FIRST_SPECIAL.grant)}.
        </LI>
        <LI>인생 특가는 서버마다 한 번 구매 가능하다.</LI>
        <LI>
          성장 프리미엄은 {won(PREMIUM.krw)}이며, 즉시 {grantText(PREMIUM.instant)}에 더해{' '}
          {fmtInt(PREMIUM.daily.days)}일 동안 매일 {grantText(PREMIUM.daily)}를 준다.
        </LI>
        <LI>프리미엄 보상은 즉시분과 매일분 모두 우편으로 오며, 받아야 지급된다.</LI>
        <LI>매일 지급은 접속한 날에 지급된다. 접속하지 않은 날은 그날 몫이 지급되지 않는다.</LI>
        <LI>이용 중에는 배너에 남은 일수가 뜨고, 기간이 끝나면 다시 살 수 있다.</LI>
      </UL>

    </>
  );
}
