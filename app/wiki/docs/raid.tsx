import {
  RAID_BASE_ATTACKS,
  RAID_CRIT_RATE_BP,
  RAID_DAILY_CAP,
  RAID_DURATION_OPTIONS_MS,
  RAID_MAX_CONCURRENT_PER_USER,
  RAID_MAX_PARTICIPANTS,
  RAID_OPEN_COST_DIAMOND,
  RAID_PHASE1_HP_MAX,
  RAID_PHASE1_HP_MIN,
  RAID_PHASE_DROP_BOXES,
  raidExtraAttackCost,
} from '@/lib/game/balance';
import { RAID_BOSS_CODES } from '@/lib/game/raid/bosses';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'raid',
  cat: '경쟁',
  title: '레이드',
  summary: '다이아로 여는 보스, 돌파한 페이즈만큼 상자.',
  sections: [
    { id: 'open', label: '소환' },
    { id: 'join', label: '참여' },
    { id: 'attack', label: '공격' },
    { id: 'phase', label: '페이즈' },
    { id: 'reward', label: '보상' },
    { id: 'limit', label: '하루 한도' },
  ],
};

/** 추가 공격 값의 계단 경계 — 비용 함수에서 직접 뽑는다(계단 폭을 문서가 따로 알 필요 없다). */
const EXTRA_COST_TIERS: { from: number; cost: number }[] = (() => {
  const tiers: { from: number; cost: number }[] = [];
  for (let n = 1; tiers.length < 3; n++) {
    const cost = raidExtraAttackCost(n);
    if (tiers[tiers.length - 1]?.cost !== cost) tiers.push({ from: n, cost });
  }
  return tiers;
})();

export default function Doc() {
  return (
    <>
      <H2 id="open">소환</H2>
      <UL>
        <LI>
          보스를 고르고 {fmtInt(RAID_OPEN_COST_DIAMOND)}{' '}
          <DocLink slug="glossary" hash="goods">다이아</DocLink>를 내면 열린다. 소환한 사람이
          방장이자 첫 참가자.
          <Fn n={1} />
        </LI>
        <LI>
          진행 시간은 열 때 고른다. {RAID_DURATION_OPTIONS_MS.map((ms) => fmtMs(ms)).join(' · ')} 중
          하나.
        </LI>
        <LI>
          보스 {fmtInt(RAID_BOSS_CODES.length)}종은 생김새와 이야기만 다르다. 체력·공격 규칙·보상은
          같다.
        </LI>
        <LI>값은 방장만 내므로, 자주 도는 사이라면 돌아가며 여는 편이 부담이 적다.</LI>
      </UL>
      <Warn>소환에 쓴 다이아는 돌려받지 못한다. 아무도 들어오지 않은 채 끝나도 마찬가지다.</Warn>

      <H2 id="join">참여</H2>
      <UL>
        <LI>정원은 방장까지 {fmtInt(RAID_MAX_PARTICIPANTS)}명.</LI>
        <LI>
          공개 범위는 열 때 친구 공개와 <DocLink slug="guild">길드원</DocLink> 공개를 따로 정한다.
          각각 세 가지.
          <Fn n={2} />
        </LI>
        <LI>비공개: 레이드 목록에 뜨지 않는다. 링크나 초대로만 들어온다.</LI>
        <LI>자유: 수락 없이 바로 참가된다.</LI>
        <LI>수락: 참가 요청이 걸리고, 방장이 수락해야 들어간다.</LI>
      </UL>
      <Warn>
        한 번 참가하면 스스로 빠져나오지 못한다. 정산될 때까지 정원 한 자리와 동시 진행 한 칸을 계속
        차지한다.
      </Warn>

      <H2 id="attack">공격</H2>
      <UL>
        <LI>공격 횟수는 레이드마다 {fmtInt(RAID_BASE_ATTACKS)}회. 남은 횟수는 정산과 함께 사라진다.</LI>
        <LI>
          늦게 들어갈수록 정산까지 남은 시간이 짧다. {fmtInt(RAID_BASE_ATTACKS)}회를 다 쓸 시간이
          남았는지 보고 들어가는 편이 낫다.
        </LI>
        <LI>
          데미지는 공격하는 순간의 <DocLink slug="combat-power" hash="total">총 전투력</DocLink>에서
          나온다. 같은 전투력이라도 한 대마다 폭이 오르내린다.
        </LI>
        <LI>{bpPct(RAID_CRIT_RATE_BP)} 확률로 크리티컬이 터지면 그 한 대는 크게 들어간다.</LI>
        <LI>
          레이드 중에 <DocLink slug="enhance">강화</DocLink>로 전투력을 올리면 다음 공격부터 세진다.
        </LI>
        <LI>기본 횟수를 다 쓰면 다이아로 추가 공격을 한 번씩 산다. 값은 살수록 오른다.</LI>
      </UL>
      <Tbl
        head={['추가 공격', '1회 값']}
        rows={EXTRA_COST_TIERS.map((t) => [
          `${fmtInt(t.from)}번째부터`,
          `${fmtInt(t.cost)} 다이아`,
        ])}
      />
      <Note>
        그 위로도 같은 폭으로 오른다. 값은 레이드마다 따로 세서 새 레이드에서는 다시 가장 싼 단계다.
      </Note>

      <H2 id="phase">페이즈</H2>
      <UL>
        <LI>
          보스 체력은 페이즈로 끊긴다. 첫 페이즈는 열릴 때 {fmtInt(RAID_PHASE1_HP_MIN)}에서{' '}
          {fmtInt(RAID_PHASE1_HP_MAX)} 사이로 정해진다.
        </LI>
        <LI>다음 페이즈로 갈수록 체력이 높아지고, 페이즈는 끝없이 이어진다.</LI>
        <LI>돌파는 참가자 전원의 누적 데미지 합으로 잡는다. 기여도 순위는 화면에만 뜬다.</LI>
      </UL>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>진행 시간이 끝나면 정산된다. 정산 뒤에는 아무도 공격하지 못한다.</LI>
        <LI>
          돌파한 페이즈 하나마다 <DocLink slug="supply">보급 상자</DocLink>{' '}
          {fmtInt(RAID_PHASE_DROP_BOXES)}개. 참가자 전원이 똑같이 받는다.
          <Fn n={3} />
        </LI>
        <LI>레이드 화면에서 보상 받기를 눌러야 상자가 들어온다.</LI>
      </UL>
      <Warn>공격을 한 번도 하지 않은 참여자는 보상에서 빠진다. 하루 횟수만 줄어든다.</Warn>

      <H2 id="limit">하루 한도</H2>
      <UL>
        <LI>
          소환과 참여를 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}번, 한국 시간 자정에 다시 찬다.
          <Fn n={4} />
        </LI>
        <LI>
          동시에 걸어둘 수 있는 레이드는 {fmtInt(RAID_MAX_CONCURRENT_PER_USER)}개. 내가 소환한 것과
          남의 것에 들어간 것을 함께 센다.
          <Fn n={5} />
        </LI>
      </UL>

      <FnList
        notes={[
          '참가는 무료다. 값은 소환할 때 한 번만 든다.',
          '공유 링크로 들어온 사람은 공개 설정과 상관없이 요청부터 걸린다. 지목해 보낸 초대는 바로 참여다. 어느 쪽이든 레이드가 열린 서버에 캐릭터가 있어야 들어간다.',
          '어느 부위 상자인지는 레이드와 페이즈로 정해진다. 상자는 그 레이드가 열렸던 서버로 들어간다.',
          '참가 요청은 수락된 날에 센다.',
          '시간이 끝났어도 정산 전이면 한 칸을 차지한다. 칸이 모자랄 때는 끝난 레이드를 열면 그 자리에서 정산된다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="combat-power">전투력</DocLink>,{' '}
        <DocLink slug="supply">보급</DocLink>, <DocLink slug="guild">길드</DocLink>.
      </P>
    </>
  );
}
