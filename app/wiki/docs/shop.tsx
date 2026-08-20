import { BOX, CASH, DIAMONDS, FIRST_SPECIAL, PREMIUM, type Period } from '@/lib/game/shop/catalog';
import { FREE_REWARDS, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free-rewards';
import { MINOR_MONTHLY_LIMIT_KRW } from '@/lib/legal/content';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Ext, Fn, FnList, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'shop',
  cat: '계정',
  title: '상점',
  summary: '무료 수령과 주머니, 패키지와 충전, 결제 전 본인인증과 환불.',
  sections: [
    { id: 'tabs', label: '탭' },
    { id: 'free', label: '무료 수령' },
    { id: 'box', label: '주머니' },
    { id: 'package', label: '패키지' },
    { id: 'charge', label: '충전' },
    { id: 'limited', label: '한정 상품' },
    { id: 'pay', label: '결제' },
    { id: 'refund', label: '환불' },
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
      <H2 id="tabs">탭</H2>
      <UL>
        <LI>상점은 일일 · 주간 · 월간 · 충전 네 탭이다.</LI>
        <LI>일일 · 주간 · 월간 탭은 무료 수령 · 견습의 주머니 · 패키지 세 종으로 구성이 같다.</LI>
        <LI>충전 탭에는 가입 선물과 다이아 충전 상품이 놓인다.</LI>
        <LI>받을 무료 수령이 남은 탭에는 점이 붙는다.</LI>
        <LI>위쪽 배너에는 인생 특가와 성장 프리미엄이 번갈아 뜬다.</LI>
        <LI>
          보급 상자가 든 상품은 확률형 아이템이며, 확률은{' '}
          <Ext href="/probability#supply">확률 공시</Ext>에서 볼 수 있다.
        </LI>
      </UL>

      <H2 id="free">무료 수령</H2>
      <UL>
        <LI>각 탭 맨 위의 무료 카드는 결제 없이 누르면 바로 지급된다.</LI>
        <LI>
          받은 카드는 흑백으로 바뀌고, 다음 주기가 되면 다시 열린다.
          <Fn n={1} />
        </LI>
        <LI>받지 않고 주기가 지나면 그 주기 몫은 사라진다.</LI>
      </UL>
      <Tbl
        head={['탭', '보상', '초기화']}
        firstColNowrap
        rows={FREE_SLOTS.map((s) => [FREE_TAB[s], grantText(FREE_REWARDS[s]), FREE_RESET[s]])}
      />
      <Note>무료 수령은 탭마다 따로라, 네 탭을 모두 열어야 그 주기 몫을 다 받는다.</Note>

      <H2 id="box">주머니</H2>
      <UL>
        <LI>
          견습의 주머니는 다이아로 사는 <DocLink slug="supply" hash="boxes">보급 상자</DocLink>{' '}
          묶음이다.
        </LI>
        <LI>탭마다 이름과 수량이 다르며, 같은 주기 안에서는 한 번만 산다.</LI>
        <LI>가진 다이아가 값보다 적으면 살 수 없다.</LI>
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
      <UL>
        <LI>일일 · 주간 · 월간 탭마다 현금 패키지가 세 종씩 있다.</LI>
        <LI>패키지는 다이아와 보급 상자를 함께 준다.</LI>
        <LI>
          주기 상품이라 같은 주기에는 하나씩만 살 수 있고, 주기가 바뀌면 다시 열린다.
          <Fn n={2} />
        </LI>
      </UL>
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
      <UL>
        <LI>
          충전 탭에서는 <DocLink slug="diamond" hash="wallet">다이아</DocLink>만 산다.
        </LI>
        <LI>횟수 제한이 없어 같은 상품을 여러 번 살 수 있다.</LI>
        <LI>묶음이 클수록 같은 금액으로 받는 다이아가 많고, 이득이 큰 상품에는 배지가 붙는다.</LI>
        <LI>헤더의 다이아를 누르면 이 탭이 바로 열린다.</LI>
      </UL>
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
        <LI>인생 특가는 서버마다 한 번이며, 사고 나면 그 서버 배너에서 사라진다.</LI>
        <LI>
          성장 프리미엄은 {won(PREMIUM.krw)}이며, 즉시 {grantText(PREMIUM.instant)}에 더해{' '}
          {fmtInt(PREMIUM.daily.days)}일 동안 매일 {grantText(PREMIUM.daily)}를 준다.
        </LI>
        <LI>프리미엄 보상은 즉시분과 매일분 모두 우편으로 오며, 받아야 지급된다.</LI>
        <LI>매일분은 접속한 날에 도착한다. 접속하지 않은 날은 그날 몫이 오지 않는다.</LI>
        <LI>이용 중에는 배너에 남은 일수가 뜨고, 기간이 끝나야 다시 살 수 있다.</LI>
      </UL>

      <H2 id="pay">결제</H2>
      <UL>
        <LI>
          현금 상품은 계정당 한 번 본인인증을 마쳐야 살 수 있다. 인증은 상점에서 바로 진행된다.
          <Fn n={3} />
        </LI>
        <LI>
          본인인증에서 미성년으로 확인된 계정은 한 달에 {won(MINOR_MONTHLY_LIMIT_KRW)}까지 결제할 수
          있고, 넘기면 결제가 막힌다.
        </LI>
        <LI>상품을 누르면 가격 확인이 뜨고, 한 번 더 누르면 결제창이 열린다.</LI>
        <LI>결제를 마치면 다이아와 보급 상자가 바로 들어온다.</LI>
        <LI>성장 프리미엄만 우편으로 온다.</LI>
        <LI>
          결제 뒤 지급이 바로 보이지 않아도 잠시 뒤 반영되며, 한참 지나도 그대로면 설정의 고객센터
          문의로 알린다.
        </LI>
      </UL>

      <H2 id="refund">환불</H2>
      <UL>
        <LI>환불은 설정의 고객센터 문의로 요청한다.</LI>
        <LI>환불하면 그 상품으로 받은 다이아와 보급 상자를 함께 회수한다.</LI>
        <LI>
          성장 프리미엄을 환불하면 남은 매일 보상이 끊기고, 아직 받지 않은 프리미엄 우편도 회수된다.
        </LI>
      </UL>
      <Warn>인생 특가는 환불해도 서버당 한 번의 기회가 돌아오지 않는다.</Warn>

      <FnList
        notes={[
          '상자는 무기 · 방어구 · 장신구로 고르게 나뉘어 들어온다.',
          '이미 산 상품은 흑백으로 바뀌고, 다시 누르면 구매완료 안내가 뜬다.',
          '본인인증은 설정에서도 할 수 있다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="diamond">다이아</DocLink>,{' '}
        <DocLink slug="supply">보급</DocLink>, <DocLink slug="avatar">아바타와 프로필</DocLink>.
      </P>
    </>
  );
}
