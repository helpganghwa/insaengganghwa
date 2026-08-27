import {
  EXPEDITION_CRIT_BP,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DAILY_STARTS,
  EXPEDITION_CRIT_BP_PER_LEVEL,
  EXPEDITION_LEVEL_MAX,
  EXPEDITION_REFRESH_COST,
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_SLOT_UNLOCKS,
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct } from '../fmt';
import { DocLink, H2, LI, Note, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'expedition',
  cat: '성장',
  title: '파견',
  summary: '아바타를 원정대로 보내 상자·다이아를 얻는 방치 미션, 하루 6회.',
  sections: [
    { id: 'flow', label: '진행' },
    { id: 'mission', label: '미션과 새로고침' },
    { id: 'avatar', label: '아바타 배정' },
    { id: 'reward', label: '보상' },
    { id: 'level', label: '파견 레벨과 슬롯' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="flow">진행</H2>
      <UL>
        <LI>파견 슬롯에 열려 있는 미션(지역 × 난이도)에 아바타 한 명을 배정해 보낸다.</LI>
        <LI>난이도가 곧 소요 시간이다 — 쉬움 4시간 · 보통 8시간 · 어려움 12시간 · 원정 24시간.</LI>
        <LI>
          파견은 하루 {EXPEDITION_DAILY_STARTS}회까지 보낼 수 있다(자정 초기화). 취소하면 보상은
          없고 사용한 횟수도 돌아오지 않는다.
        </LI>
        <LI>남은 시간은 다이아로 즉시 완료할 수 있다(1분당 1개 — 강화 시간 단축과 같은 비율).</LI>
        <LI>귀환한 원정대의 보상을 수령하면 그 슬롯에 새 미션이 열린다.</LI>
      </UL>

      <H2 id="mission">미션과 새로고침</H2>
      <UL>
        <LI>미션의 보상은 열리는 순간 확정되어 카드에 그대로 표시된다 — 받을 것을 보고 고른다.</LI>
        <LI>
          마음에 들지 않는 미션은 새로고침으로 교체한다 — 하루 {EXPEDITION_REFRESH_FREE_PER_DAY}회
          무료, 이후 회당 다이아 {EXPEDITION_REFRESH_COST}개.
        </LI>
        <LI>배정하지 않은 미션은 매일 자정 전체 교체된다.</LI>
        <LI>지역마다 잘 나오는 상자 종류가 다르다 — 필요한 슬롯의 상자를 노려 지역을 고르자.</LI>
      </UL>

      <H2 id="avatar">아바타 배정</H2>
      <UL>
        <LI>
          미션 하나당 <DocLink slug="avatar">아바타</DocLink> 한 명을 배정한다. 파견 중인 아바타는
          다른 미션에 보낼 수 없다.
        </LI>
        <LI>
          아바타를 만들 때 입힌 장비의 <b>지역</b>이 미션 지역과 일치하면 장비 하나당 보상 +
          {bpPct(EXPEDITION_SYNERGY_MATCH_BP)} — 최대 +{bpPct(EXPEDITION_SYNERGY_MATCH_BP * 3)}.
        </LI>
        <LI>
          지역이 없는 &ldquo;일반&rdquo; 장비는 어느 미션에서든 하나당 +
          {bpPct(EXPEDITION_SYNERGY_GENERAL_BP)}. 불일치 장비는 보너스가 없을 뿐 손해는 없다.
        </LI>
        <LI>기본 아바타도 배정할 수 있다(시너지 없음).</LI>
        <LI>
          보상 배율은 보낸 아바타의 <b>강화 합</b>(아바타를 만들 때 입힌 장비 세 개의 현재 강화 레벨 합)으로
          정해진다 — 높을수록 많이 받고 상한은 없다. 강한 장비로 만든 아바타가 곧 최고의 원정대원이다.
        </LI>
      </UL>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>보급상자 또는 다이아, 혹은 둘 다 — 구성과 수량은 미션 카드에 확정 표시된다.</LI>
        <LI>
          수령 시 {bpPct(EXPEDITION_CRIT_BP)} 확률로 <b>대성공</b> — 수량이 {EXPEDITION_CRIT_MULT}
          배가 된다.
        </LI>
        <LI>정확한 확률표는 확률 안내(/probability)의 파견 항목에 공시되어 있다.</LI>
      </UL>

      <H2 id="level">파견 레벨과 슬롯</H2>
      <UL>
        <LI>
          파견을 완료하면 시간만큼 XP를 얻는다(예: 8시간 미션 = 8 XP). 최대 Lv.{EXPEDITION_LEVEL_MAX}. 레벨은
          보상 수량을 올리지 않는다 — 대신 레벨당 대성공 확률이 +{bpPct(EXPEDITION_CRIT_BP_PER_LEVEL)}p 오른다.
        </LI>
        <LI>레벨이 오르면 더 어려운(=더 긴·더 후한) 미션이 자주 등장한다.</LI>
      </UL>
      <Tbl
        head={['슬롯', '무료 오픈', '즉시 구매']}
        rows={[
          ['슬롯 1', '기본 제공', '—'],
          ...EXPEDITION_SLOT_UNLOCKS.map((u) => [
            `슬롯 ${u.slot}`,
            `파견 Lv.${u.level}`,
            `다이아 ${u.diamond.toLocaleString('ko-KR')}`,
          ]),
        ]}
      />
      <Note>
        원정 나간 아바타도 대표 아바타 표시는 그대로 유지된다 — 파견은 아바타의 겉모습을 바꾸지
        않는다.
      </Note>
    </>
  );
}
