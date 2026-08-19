import {
  GUILD_BASE_CAPACITY,
  GUILD_CREATE_COST_DIAMOND,
  GUILD_DONATIONS_PER_DAY,
  GUILD_DONATION_TIERS,
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
  GUILD_JOIN_REQUEST_TTL_DAYS,
  GUILD_MAX_CAPACITY,
  GUILD_NAME_MAX_LEN,
  GUILD_NAME_MIN_LEN,
  GUILD_REJOIN_LOCK_HOURS,
  GUILD_XP_PER_LEVEL_STEP,
  MAX_GUILD_EMBLEMS,
  guildCapacity,
  guildXpToNext,
} from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'guild',
  cat: '길드',
  title: '길드 기본',
  summary: '결성과 가입, 기부로 오르는 레벨과 정원, 나가면 걸리는 잠금.',
  sections: [
    { id: 'create', label: '결성' },
    { id: 'join', label: '가입' },
    { id: 'donate', label: '기부' },
    { id: 'level', label: '레벨과 정원' },
    { id: 'leave', label: '탈퇴' },
    { id: 'disband', label: '해산' },
  ],
};

/** 단계별 기부 비용 — 무료 단계는 금액 대신 '무료'로. */
const DONATION_COSTS = GUILD_DONATION_TIERS.map((t) =>
  t.cost === 0 ? '무료' : `${fmtInt(t.cost)}다이아`,
).join(' · ');

/** 레벨 L에 닿기까지 넣어야 하는 기부 경험치 총합. */
function cumulativeXp(level: number): number {
  let sum = 0;
  for (let l = 0; l < level; l++) sum += guildXpToNext(l);
  return sum;
}

/** 정원이 상한에 닿는 레벨 — 표의 마지막 칸. */
const CAP_LEVEL = GUILD_MAX_CAPACITY - GUILD_BASE_CAPACITY;
const CAP_ROWS = [0, 0.25, 0.5, 0.75, 1].map((f) => {
  const level = Math.round(CAP_LEVEL * f);
  return [
    `Lv.${fmtInt(level)}`,
    `${fmtInt(guildCapacity(level))}명`,
    fmtInt(cumulativeXp(level)),
  ] as const;
});

export default function Doc() {
  return (
    <>
      <H2 id="create">결성</H2>
      <UL>
        <LI>
          결성 비용은 {fmtInt(GUILD_CREATE_COST_DIAMOND)}
          <DocLink slug="glossary" hash="goods">다이아</DocLink>. 만든 사람이 길드장이 되고 가입
          방식은 승인제로 시작한다.
        </LI>
        <LI>한 서버에 소속할 수 있는 길드는 하나라, 어디든 들어가 있으면 새로 만들지 못한다.</LI>
        <LI>
          이름은 {fmtInt(GUILD_NAME_MIN_LEN)}~{fmtInt(GUILD_NAME_MAX_LEN)}자, 한글·영문·숫자만 쓴다.
          <Fn n={1} />
        </LI>
        <LI>
          문양은 결성할 때 한 장이 무료. 이후로는 만들 때마다{' '}
          {fmtInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)}다이아가 들고 {fmtInt(MAX_GUILD_EMBLEMS)}장까지
          보관한다.
        </LI>
      </UL>

      <H2 id="join">가입</H2>
      <UL>
        <LI>가입 방식은 자유 가입과 승인제 둘이다. 자유 가입이면 누르는 즉시 들어간다.</LI>
        <LI>
          승인제면 신청이 걸린 뒤{' '}
          <DocLink slug="guild-roles" hash="perms">가입 관리 권한</DocLink>자가 승인하거나 거절한다.
        </LI>
        <LI>어느 쪽이든 정원이 차 있으면 못 들어간다.</LI>
        <LI>
          신청은 한 번에 한 곳만 걸린다. 다른 길드에 신청하면 앞의 신청이 그리로 옮겨 간다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="donate">기부</H2>
      <UL>
        <LI>기부는 하루 {fmtInt(GUILD_DONATIONS_PER_DAY)}번, 한국 시간 자정에 다시 찬다.</LI>
        <LI>단계가 올라갈수록 비용이 오른다({DONATION_COSTS}).</LI>
        <LI>
          얻는 경험치는 단계와 상관없이 {fmtInt(GUILD_DONATION_TIERS[0].xp)}으로 같다. 뒤 단계는 같은
          것을 비싸게 사는 셈.
        </LI>
        <LI>그래서 다이아를 아끼는 길드원은 무료 단계만 매일 넣는다. 그것만으로도 레벨은 오른다.</LI>
        <LI>기부 한 번은 길드 경험치와 개인 기여도에 같은 값으로 쌓인다.</LI>
        <LI>
          기여도는 길드 안에 누적으로 남아{' '}
          <DocLink slug="conquest" hash="tax">세금</DocLink> 분배와{' '}
          <DocLink slug="guild-roles" hash="handover">길드장 자동 위임</DocLink>에서 기준이 된다.
        </LI>
      </UL>

      <H2 id="level">레벨과 정원</H2>
      <UL>
        <LI>
          레벨은 기부로만 오른다. 다음 레벨까지 필요한 경험치가 {fmtInt(GUILD_XP_PER_LEVEL_STEP)}씩
          늘어나 뒤로 갈수록 한 레벨이 길어진다.
        </LI>
        <LI>
          정원은 {fmtInt(GUILD_BASE_CAPACITY)}명에서 시작해 레벨 하나당 한 자리씩 늘고{' '}
          {fmtInt(GUILD_MAX_CAPACITY)}명에서 멈춘다.
          <Fn n={3} />
        </LI>
      </UL>
      <Tbl head={['레벨', '정원', '누적 기부 경험치']} rows={CAP_ROWS} />
      <Note>기부는 길드원이 각자 넣는다. 사람이 많을수록 하루에 들어오는 경험치도 커진다.</Note>

      <H2 id="leave">탈퇴</H2>
      <UL>
        <LI>
          길드원은 언제든 나간다. 나가는 순간 맡고 있던{' '}
          <DocLink slug="conquest" hash="executor">집행관</DocLink> 자리와 넣어둔{' '}
          <DocLink slug="conquest" hash="deploy">배치</DocLink>가 함께 풀린다.
        </LI>
        <LI>나가면 그 길드에 쌓아둔 기여도는 사라진다. 다시 들어와도 0에서 시작한다.</LI>
        <LI>
          길드장은 위임하거나 해산해야 나간다.
          <Fn n={4} />
        </LI>
        <LI>옮길 생각이면 갈 곳을 먼저 정하고 나오는 것이 낫다. 나온 뒤에는 잠금이 풀릴 때까지 못 들어간다.</LI>
      </UL>
      <Warn>
        탈퇴하거나 추방당하면 그 서버에서 {fmtInt(GUILD_REJOIN_LOCK_HOURS)}시간 동안 어떤 길드에도
        들어가지 못한다. 원래 길드로 돌아가는 것도 막힌다.
      </Warn>

      <H2 id="disband">해산</H2>
      <UL>
        <LI>해산은 길드장만 한다.</LI>
        <LI>
          길드장이 오래 접속하지 않고 위임받을 사람도 없으면 길드가 해산된다. 조건은{' '}
          <DocLink slug="guild-roles" hash="handover">자동 위임</DocLink>에 있다.
        </LI>
      </UL>
      <Warn>
        해산하면 보유 <DocLink slug="conquest" hash="abandon">구역</DocLink>이 전부 중립으로 풀리고
        모아둔 세금은 사라진다. 문양과 길드 기록도 함께 지워지고 되돌릴 방법은 없다.
      </Warn>

      <FnList
        notes={[
          '이름은 전 서버를 통틀어 하나다. 다른 서버에 같은 이름이 있으면 막힌다.',
          `걸어둔 신청은 ${fmtInt(GUILD_JOIN_REQUEST_TTL_DAYS)}일이 지나면 사라진다.`,
          '정원이 멈춘 뒤에도 레벨은 계속 오르고, 길드 순위의 기준으로 남는다.',
          '혼자 남은 길드장이 탈퇴하면 그대로 해산된다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="guild-roles">길드 권한</DocLink>,{' '}
        <DocLink slug="conquest">점령전</DocLink>, <DocLink slug="raid">레이드</DocLink>.
      </P>
    </>
  );
}
