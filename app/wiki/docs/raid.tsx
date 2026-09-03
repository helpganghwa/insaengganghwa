import {
  RAID_BASE_ATTACKS,
  RAID_CRIT_RATE_BP,
  RAID_DAILY_CAP,
  RAID_DURATION_OPTIONS_MS,
  RAID_MAX_CONCURRENT_PER_USER,
  RAID_MAX_PARTICIPANTS,
  RAID_PHASE1_HP_MAX,
  RAID_PHASE1_HP_MIN,
  RAID_TIERS,
  RAID_TIER_CODES,
  raidExtraAttackCost,
  raidMilestoneList,
} from '@/lib/game/balance';
import { RAID_BOSS_CODES } from '@/lib/game/raid/bosses';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'raid',
  cat: '경쟁',
  title: '레이드',
  summary: '난이도를 골라 소환하는 보스, 돌파한 페이즈와 마일스톤만큼 상자.',
  sections: [
    { id: 'open', label: '소환' },
    { id: 'tier', label: '난이도' },
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
          보스와 난이도를 선택하고 다이아를 사용해서 소환하며(
          {RAID_TIER_CODES.map((t) => `${RAID_TIERS[t].label} ${fmtInt(RAID_TIERS[t].openCost)}`).join(
            ' · ',
          )}
          ), 소환한 사람이 방장이자 첫 참가자가 된다.
          <Fn n={1} />
        </LI>
        <LI>
          진행 시간은 소환할 때 {RAID_DURATION_OPTIONS_MS.map((ms) => fmtMs(ms)).join(' · ')} 중에서
          고른다.
        </LI>
        <LI>
          보스 {fmtInt(RAID_BOSS_CODES.length)}종은 생김새와 이야기만 다르며, 체력·공격 규칙·보상은
          같다.
        </LI>
      </UL>
      <Warn>
        소환에 쓴 다이아는 돌려받지 못한다. 아무도 참여하지 않은 채 끝나도 돌려받지 못한다.
      </Warn>

      <H2 id="tier">난이도</H2>
      <UL>
        <LI>소환할 때 난이도를 고르며, 난이도에 따라 소환 비용·보스 체력·보상이 달라진다.</LI>
        <LI>
          보상은 어느 난이도든 참가자 전원에게 동일하게 지급되며, 기여도에 따라 달라지지 않는다.
        </LI>
      </UL>
      <Tbl
        head={['난이도', '소환', '보스 체력', '페이즈당 상자', '마일스톤', '권장 총합 전투력']}
        rows={RAID_TIER_CODES.map((t) => {
          const r = RAID_TIERS[t];
          return [
            r.label,
            `${fmtInt(r.openCost)} 다이아`,
            `쉬움의 ×${fmtInt(r.hpMult)}`,
            `${fmtInt(r.boxesPerPhase)}개`,
            raidMilestoneList(t)
              .map(([p, b]) => `${fmtInt(p)}페이즈 ${fmtInt(b)}개`)
              .join(' · '),
            r.recommendedTotalCp > 0 ? `${fmtInt(r.recommendedTotalCp)} 이상` : '제한 없음',
          ];
        })}
      />
      <Note>
        마일스톤은 누적 돌파 페이즈가 표의 수에 도달할 때마다 한 번씩 받는 추가 상자다. 권장 총합
        전투력은 참가자 전원의 총 전투력 합이며, 이보다 약한 파티는 한 단계 낮은 난이도가 상자를 더
        많이 받는다. 혼자라면 쉬움이 가장 유리하다.
      </Note>

      <H2 id="join">참여</H2>
      <UL>
        <LI>정원은 방장을 포함해서 {fmtInt(RAID_MAX_PARTICIPANTS)}명.</LI>
        <LI>
          공개 범위는 소환할 때 친구 공개와 <DocLink slug="guild">길드원</DocLink> 공개를 따로
          정하며, 각각 세 가지다.
          <Fn n={2} />
        </LI>
        <LI>비공개: 레이드 목록에 표시되지 않으며, 링크나 초대로만 참여한다.</LI>
        <LI>자유: 수락 없이 바로 참가된다.</LI>
        <LI>수락: 참가 요청이 등록되고, 방장이 수락해야 참여된다.</LI>
      </UL>
      <Warn>한 번 참가하면 정산될 때까지 스스로 나갈 수 없다.</Warn>

      <H2 id="attack">공격</H2>
      <UL>
        <LI>기본 공격 횟수는 레이드마다 {fmtInt(RAID_BASE_ATTACKS)}회이며, 미사용 횟수는 사라진다.</LI>
        <LI>
          늦게 참여할수록 정산까지 남은 시간이 짧으므로, {fmtInt(RAID_BASE_ATTACKS)}회를 다 쓸
          시간이 남았는지 확인하는 것이 좋다.
        </LI>
        <LI>
          데미지는 공격하는 순간의 <DocLink slug="combat-power" hash="total">총 전투력</DocLink>으로
          결정되며, 같은 전투력이라도 공격마다 편차가 있다.
        </LI>
        <LI>{bpPct(RAID_CRIT_RATE_BP)} 확률로 크리티컬이 발생하면 그 공격은 데미지가 크게 오른다.</LI>
        <LI>
          레이드 중에 <DocLink slug="enhance">강화</DocLink>로 전투력을 올리면 다음 공격부터 바로
          반영된다.
        </LI>
        <LI>
          기본 횟수를 다 쓰면 다이아로 추가 공격을 한 번씩 구매할 수 있고, 비용은 구매할수록 오른다.
        </LI>
      </UL>
      <Tbl
        head={['추가 공격', '1회 비용']}
        rows={EXTRA_COST_TIERS.map((t) => [
          `${fmtInt(t.from)}번째부터`,
          `${fmtInt(t.cost)} 다이아`,
        ])}
      />
      <Note>
        그 위로도 같은 폭으로 오른다. 비용은 레이드마다 따로 적용되어 새 레이드에서는 다시 가장
        낮은 단계부터 시작한다.
      </Note>

      <H2 id="phase">페이즈</H2>
      <UL>
        <LI>
          보스 체력은 페이즈 단위로 나뉜다. 첫 페이즈는 소환될 때 {fmtInt(RAID_PHASE1_HP_MIN)}에서{' '}
          {fmtInt(RAID_PHASE1_HP_MAX)} 사이로 랜덤하게 정해지고, 여기에 난이도 배수(
          {RAID_TIER_CODES.map((t) => `${RAID_TIERS[t].label} ×${fmtInt(RAID_TIERS[t].hpMult)}`).join(
            ' · ',
          )}
          )가 곱해진다.
        </LI>
        <LI>다음 페이즈로 갈수록 체력이 높아지고, 페이즈는 끝없이 이어진다.</LI>
        <LI>
          돌파는 참가자 전원의 누적 데미지 합으로 판정되며, 기여도 순위는 화면에서 확인할 수 있다.
        </LI>
      </UL>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>진행 시간이 끝나면 정산되며, 정산 뒤에는 공격할 수 없다.</LI>
        <LI>
          돌파한 페이즈 하나마다 랜덤 부위 <DocLink slug="supply">보급 상자</DocLink>가 난이도별
          개수(
          {RAID_TIER_CODES.map((t) => `${RAID_TIERS[t].label} ${fmtInt(RAID_TIERS[t].boxesPerPhase)}개`).join(
            ' · ',
          )}
          )로 참가자 전원에게 동일하게 지급된다.
        </LI>
        <LI>
          누적 돌파 페이즈가 마일스톤에 도달하면 난이도 표의 상자를 추가로 받는다. 정산 화면의 누적
          보상에 돌파 상자와 마일스톤 상자가 나뉘어 표시된다.
        </LI>
        <LI>레이드 화면에서 보상 받기를 눌러야 상자가 지급된다.</LI>
        <LI>
          <DocLink slug="ranking">랭킹</DocLink>과 칭호의 레이드 횟수는 정산될 때 페이즈를 하나 이상
          돌파했고 본인이 공격에 한 번 이상 참여한 레이드마다 1회로 집계된다.
        </LI>
      </UL>
      <Warn>공격을 한 번도 하지 않은 참여자는 보상에서 제외되며, 하루 횟수만 차감된다.</Warn>

      <H2 id="limit">하루 한도</H2>
      <UL>
        <LI>
          소환과 참여를 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}번이며, 자정에 초기화된다.
          <Fn n={3} />
        </LI>
        <LI>
          동시에 진행할 수 있는 레이드는 {fmtInt(RAID_MAX_CONCURRENT_PER_USER)}개이며, 직접 소환한
          것과 남의 레이드에 참여한 것이 같이 포함된다.
          <Fn n={4} />
        </LI>
      </UL>

      <FnList
        notes={[
          '참가는 무료이며, 비용은 소환할 때 한 번만 든다.',
          '공유 링크로 들어온 사람은 공개 설정과 상관없이 참가 요청이 가능하다. 지목해 보낸 초대는 바로 참여된다.',
          '참가 요청은 요청 시에는 횟수가 차감되지 않고, 수락된 날에 차감된다.',
          '레이드가 끝났어도 정산 전이면 한 칸을 차지한다.',
        ]}
      />
    </>
  );
}
