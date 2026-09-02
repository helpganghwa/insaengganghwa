import {
  EXPEDITION_CRIT_BP,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_CRIT_SUM_BP_MAX,
  EXPEDITION_HOURS,
  EXPEDITION_REFRESH_COST,
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_SLOT_UNLOCKS,
  EXPEDITION_SYNERGY_GENERAL_MULT,
  EXPEDITION_SYNERGY_MATCH_MULT,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct } from '../fmt';
import { DocLink, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'expedition',
  cat: '성장',
  title: '파견',
  summary: '아바타를 보내 상자·다이아를 얻는 방치 콘텐츠. 슬롯마다 하루 한 번, 8시간 뒤 귀환.',
  sections: [
    { id: 'flow', label: '진행' },
    { id: 'mission', label: '파견과 새로고침' },
    { id: 'avatar', label: '아바타 배정' },
    { id: 'reward', label: '보상' },
    { id: 'slot', label: '슬롯' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="flow">진행</H2>
      <UL>
        <LI>파견 슬롯에 아바타 한 명을 배정해 보낸다.</LI>
        <LI>소요 시간은 항상 {EXPEDITION_HOURS}시간. 돌아온 원정대의 카드를 누르면 보상을 받는다.</LI>
        <LI>슬롯마다 하루에 한 번 보낼 수 있다(자정 기준).</LI>
        <LI>보상을 받은 슬롯은 그날은 “오늘 완료”로 남고, 자정이 지나면 새 파견이 생긴다.</LI>
      </UL>

      <H2 id="mission">파견과 새로고침</H2>
      <UL>
        <LI>파견의 보상은 열리는 순간 확정되어 카드에 그대로 표시된다.</LI>
        <LI>
          마음에 들지 않는 파견은 새로고침으로 교체한다(대기 중인 파견이 한 번에 바뀐다). 하루{' '}
          {EXPEDITION_REFRESH_FREE_PER_DAY}회 무료, 이후 회당 다이아 {EXPEDITION_REFRESH_COST}개.
        </LI>
        <LI>배정하지 않은 파견은 매일 자정 전체 교체된다.</LI>
      </UL>

      <H2 id="avatar">아바타 배정</H2>
      <UL>
        <LI>
          파견 하나당 <DocLink slug="avatar">아바타</DocLink> 한 명을 배정한다. 배율이 가장 높은 아바타가 기본으로
          골라져 있고, 다른 아바타를 눌러 바꿀 수 있다. 파견 중인 아바타는 다른 파견에 보낼 수 없다.
        </LI>
        <LI>
          보상 배율은 보낸 아바타의 <b>강화 합</b>(아바타를 만들 때 사용한 장비 세 개의 현재 강화 레벨 합)으로
          정해진다. 높을수록 많이 받고 상한은 없다.
        </LI>
        <LI>
          아바타를 만들 때 사용한 장비의 <b>지역</b>이 파견지와 일치하면 그 장비의 강화 레벨을{' '}
          {EXPEDITION_SYNERGY_MATCH_MULT}배로 쳐서 강화 합에 반영한다. 지역 장비를 많이 강화할수록 그 지역 파견
          보상이 좋아진다. 장비의 지역은 <DocLink slug="equipment" hash="region">장비 상세</DocLink>에서 확인할 수 있다.
        </LI>
        <LI>
          지역이 없는 &ldquo;일반&rdquo; 장비는 어느 파견지에서든 {EXPEDITION_SYNERGY_GENERAL_MULT}배.
        </LI>
        <LI>기본 아바타도 배정할 수 있지만 배율은 없다.</LI>
      </UL>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>보급상자 또는 다이아, 혹은 둘 다. 구성과 수량은 파견 카드에 표시된다.</LI>
        <LI>
          수령 시 일정 확률로 <b>대성공</b>하면 보상이 {EXPEDITION_CRIT_MULT}배가 된다. 기본{' '}
          {bpPct(EXPEDITION_CRIT_BP)}에 <b>합산 강화</b>(보유 장비 강화 레벨의 합) 1,000당 +1%p(최대 +
          {EXPEDITION_CRIT_SUM_BP_MAX / 100}%p).
        </LI>
        <LI>정확한 확률표는 확률 안내(/probability)의 파견 항목에 공시되어 있다.</LI>
      </UL>

      <H2 id="slot">슬롯</H2>
      <UL>
        <LI>첫 슬롯은 처음부터 열려 있고, 나머지 슬롯은 <b>합산 강화</b>로만 열린다.</LI>
        <LI>합산 강화가 내려가 조건에 못 미치면 그 슬롯에 새로 보낼 수 없지만, 이미 나간 파견은 돌아올 때까지 유지된다.</LI>
      </UL>
      <Tbl
        head={['슬롯', '오픈 조건']}
        rows={EXPEDITION_SLOT_UNLOCKS.map((u) => [
          `슬롯 ${u.slot}`,
          u.enhanceSum === 0 ? '처음부터 열림' : `합산 강화 ${u.enhanceSum.toLocaleString('ko-KR')}`,
        ])}
      />
    </>
  );
}
