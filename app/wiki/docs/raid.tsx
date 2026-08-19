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
import { DocLink, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'raid',
  cat: '경쟁',
  title: '레이드',
  summary: '다이아로 여는 보스, 넘긴 페이즈만큼 상자.',
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
      <P>
        보스를 하나 고르고 {fmtInt(RAID_OPEN_COST_DIAMOND)} 다이아를 내면 레이드가 열린다. 연 사람이
        첫 참가자가 되고, 뒤에 들어오는 사람은 아무것도 내지 않는다.
      </P>
      <P>
        진행 시간도 같이 고른다. {RAID_DURATION_OPTIONS_MS.map((ms) => fmtMs(ms)).join(' · ')} 중
        하나이고, 시작한 뒤에는 늘릴 수 없다.
      </P>
      <P>
        보스는 {fmtInt(RAID_BOSS_CODES.length)}종인데 생김새와 이야기만 다르다. 체력도 공격 규칙도
        보상도 같다.
      </P>
      <Warn>소환에 쓴 다이아는 돌려받지 못한다. 아무도 들어오지 않거나 페이즈를 하나도 넘기지 못한 채 끝나도 마찬가지다.</Warn>

      <H2 id="join">참여</H2>
      <P>
        정원은 연 사람까지 {fmtInt(RAID_MAX_PARTICIPANTS)}명이다. 누구에게 보일지는 열 때 친구와
        길드원을 따로 정하고, 나중에 바꾸지 못한다. 각각 세 가지다.
      </P>
      <UL>
        <LI>비공개: 상대 목록에 뜨지 않는다. 링크나 초대로만 들어온다.</LI>
        <LI>자유: 목록에서 누르면 바로 참가된다.</LI>
        <LI>수락: 목록에서 누르면 요청이 걸리고, 소환한 사람이 수락해야 들어간다.</LI>
      </UL>
      <P>
        공유 링크로 들어온 사람은 공개 설정과 상관없이 요청부터 걸린다. 지목해 보낸 초대는 수락 없이
        바로 참여다.
      </P>
      <P>
        레이드는 열린 서버에 묶인다. 그 서버에 캐릭터가 없으면 링크를 받아도 들어가지 못한다. 참가하지
        않고 구경만 하면 횟수는 줄지 않는다.
      </P>
      <Warn>한 번 참가하면 스스로 빠져나오지 못한다. 들어간 레이드는 정산될 때까지 정원 한 자리와 동시 진행 한 칸을 계속 차지한다.</Warn>

      <H2 id="attack">공격</H2>
      <P>
        참여자는 레이드마다 {fmtInt(RAID_BASE_ATTACKS)}회를 기본으로 받는다. 쓴 횟수는 시간이 지나도
        다시 차지 않고, 남은 횟수는 정산되면 사라진다.
      </P>
      <P>
        데미지는 때리는 순간의 총 전투력에서 나온다. 빗나가는 일은 없고, 같은 전투력이라도 한 대마다
        폭이 오르내린다. {bpPct(RAID_CRIT_RATE_BP)} 확률로 크리티컬이 터지면 그 한 대는 크게 들어간다.
      </P>
      <P>
        치는 도중에 전투력을 올리면 다음 공격부터 반영된다. 기본 횟수를 다 쓰면 다이아로 한 대씩 더
        사고, 값은 몇 번째로 사느냐에 따라 오른다.
      </P>
      <Tbl
        head={['추가 공격', '1회 값']}
        rows={EXTRA_COST_TIERS.map((t) => [
          `${fmtInt(t.from)}번째부터`,
          `${fmtInt(t.cost)} 다이아`,
        ])}
      />
      <Note>그 위로도 같은 폭으로 오른다. 값은 레이드마다 따로 세서 새 레이드에서는 다시 가장 싼 단계다.</Note>

      <H2 id="phase">페이즈</H2>
      <P>
        보스 체력은 페이즈로 끊긴다. 첫 페이즈는 열릴 때 {fmtInt(RAID_PHASE1_HP_MIN)}에서{' '}
        {fmtInt(RAID_PHASE1_HP_MAX)} 사이로 정해지고, 다음 페이즈로 갈수록 두꺼워진다. 마지막
        페이즈는 없다.
      </P>
      <P>
        돌파는 참가자 전원의 누적 데미지 합으로 잡는다. 개인 데미지 순위는 화면에 뜨지만 보상을
        가르지 않는다.
      </P>

      <H2 id="reward">보상</H2>
      <P>
        진행 시간이 끝나면 정산된다. 정산 뒤에는 아무도 공격하지 못한다.
      </P>
      <P>
        보상은 돌파한 페이즈 수를 따라간다. 하나 넘길 때마다 보급 상자{' '}
        {fmtInt(RAID_PHASE_DROP_BOXES)}개가 걸리고, 어느 부위 상자인지는 레이드와 페이즈로 정해져
        전원이 똑같이 받는다. 데미지에 따른 차등도 다이아도 없다.
      </P>
      <P>
        상자는 저절로 들어오지 않는다. 레이드 화면에서 보상 받기를 눌러야 쌓이고, 그 레이드가 열렸던
        서버로 들어간다. 기한은 없다.
      </P>
      <Warn>공격을 한 번도 하지 않은 참여자는 보상에서 빠진다. 들어가기만 하고 안 치면 하루 횟수만 줄어든다.</Warn>

      <H2 id="limit">하루 한도</H2>
      <P>
        소환과 참여를 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}번, 한국 시간 자정에 다시 찬다. 요청은 수락된
        날짜로 세니 거절당하거나 방치된 요청은 횟수를 쓰지 않는다.
      </P>
      <P>
        동시에 걸어둘 수 있는 레이드는 {fmtInt(RAID_MAX_CONCURRENT_PER_USER)}개다. 내가 연 것과 남의
        것에 들어간 것을 함께 세고, 시간이 끝났어도 정산 전이면 한 칸을 차지한다. 답답하면 끝난
        레이드를 열어 그 자리에서 정산시키면 된다.
      </P>
      <P>
        같이 보면 좋은 문서: <DocLink slug="combat-power">전투력</DocLink>,{' '}
        <DocLink slug="supply">보급</DocLink>, <DocLink slug="guild">길드</DocLink>.
      </P>
    </>
  );
}
