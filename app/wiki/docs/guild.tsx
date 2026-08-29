import {
  GUILD_BASE_CAPACITY,
  GUILD_CREATE_COST_DIAMOND,
  GUILD_DONATIONS_PER_DAY,
  GUILD_DONATION_TIERS,
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
  GUILD_JOIN_REQUEST_TTL_DAYS,
  GUILD_REAPPLY_COOLDOWN_HOURS,
  GUILD_MAX_CAPACITY,
  GUILD_NAME_MAX_LEN,
  GUILD_NAME_MIN_LEN,
  GUILD_REJOIN_LOCK_HOURS,

  MAX_GUILD_EMBLEMS,
  guildCapacity,
  guildXpToNext,
} from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'guild',
  cat: '길드',
  title: '길드 기본',
  summary: '결성과 가입, 기부로 오르는 레벨과 정원, 탈퇴 시 걸리는 잠금.',
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
          다이아이며, 만든 사람이 길드장이 되고 가입
          방식은 승인제로 시작한다.
        </LI>
        <LI>한 서버에 소속할 수 있는 길드는 하나이므로, 이미 가입한 상태에서는 새로 만들지 못한다.</LI>
        <LI>
          이름은 {fmtInt(GUILD_NAME_MIN_LEN)}~{fmtInt(GUILD_NAME_MAX_LEN)}자, 한글·영문·숫자만
          사용한다.
          <Fn n={1} />
        </LI>
        <LI>
          문양은 결성할 때 한 장이 무료이며, 이후로는 만들 때마다{' '}
          {fmtInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)}다이아가 들고 {fmtInt(MAX_GUILD_EMBLEMS)}장까지
          보관할 수 있다.
        </LI>
      </UL>

      <H2 id="join">가입</H2>
      <UL>
        <LI>가입 방식은 자유 가입과 승인제 둘이며, 자유 가입이면 신청 즉시 가입된다.</LI>
        <LI>
          승인제면 신청이 등록된 뒤{' '}
          <DocLink slug="guild-roles" hash="perms">가입 관리 권한</DocLink>자가 승인하거나 거절한다.
        </LI>
        <LI>자유 가입·승인제 모두 정원이 차 있으면 가입할 수 없다.</LI>
        <LI>
          신청은 한 번에 한 곳만 유지된다. 다른 길드에 신청하면 앞의 신청은 자동으로 취소된다.
        </LI>
        <LI>
          거절된 길드에는 {GUILD_REAPPLY_COOLDOWN_HOURS}시간이 지난 뒤 다시 신청할 수 있다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="donate">기부</H2>
      <UL>
        <LI>기부는 하루 {fmtInt(GUILD_DONATIONS_PER_DAY)}번이며, 자정에 초기화된다.</LI>
        <LI>단계가 올라갈수록 비용이 오른다({DONATION_COSTS}).</LI>
        <LI>
          획득하는 경험치는 단계와 상관없이 {fmtInt(GUILD_DONATION_TIERS[0].xp)}으로 같다.
        </LI>
        <LI>기부는 길드 경험치와 개인 기여도에 같은 값으로 쌓인다.</LI>
        <LI>
          기여도는{' '}
          <DocLink slug="guild-roles" hash="handover">길드장 자동 위임</DocLink>에서 기준이 된다.
        </LI>
      </UL>

      <H2 id="level">레벨과 정원</H2>
      <UL>
        <LI>
          레벨은 기부로만 오르며, 다음 레벨까지 필요한 경험치가 단계마다 늘어나 뒤로 갈수록
          레벨업이 어려워진다.
        </LI>
        <LI>
          정원은 {fmtInt(GUILD_BASE_CAPACITY)}명에서 시작해 레벨 하나당 한 자리씩 늘고 최대{' '}
          {fmtInt(GUILD_MAX_CAPACITY)}명까지 늘어난다.
          <Fn n={3} />
        </LI>
      </UL>
      <Tbl head={['레벨', '정원', '누적 기부 경험치']} rows={CAP_ROWS} />

      <H2 id="leave">탈퇴</H2>
      <UL>
        <LI>
          길드원은 언제든 탈퇴할 수 있으며, 탈퇴하는 순간 맡고 있던{' '}
          <DocLink slug="conquest" hash="executor">집행관</DocLink>과{' '}
          <DocLink slug="conquest" hash="deploy">배치</DocLink>가 함께 풀린다.
        </LI>
        <LI>탈퇴하면 그 길드에 쌓은 기여도는 사라지며, 다시 가입해도 0에서 시작한다.</LI>
        <LI>
          길드장은 위임하거나 해산해야 탈퇴할 수 있다.
          <Fn n={4} />
        </LI>
      </UL>
      <Warn>
        탈퇴하거나 추방당하면 해당 서버에서 {fmtInt(GUILD_REJOIN_LOCK_HOURS)}시간 동안 어떤
        길드에도 가입하지 못하며, 원래 길드로 돌아가는 것도{' '}
        {fmtInt(GUILD_REJOIN_LOCK_HOURS)}시간 동안 막힌다.
      </Warn>

      <H2 id="disband">해산</H2>
      <UL>
        <LI>해산은 길드장만 가능하다.</LI>
        <LI>
          길드장이 오래 접속하지 않고 위임받을 사람도 없으면 길드가 자동으로 해산된다. 조건은{' '}
          <DocLink slug="guild-roles" hash="handover">자동 위임</DocLink>에서 확인할 수 있다.
        </LI>
      </UL>
      <Warn>
        해산하면 보유 <DocLink slug="conquest" hash="abandon">구역</DocLink>이 전부 중립으로 풀리고
        길드에 모아둔 세금은 사라지며 복구할 수 없다.
      </Warn>

      <FnList
        notes={[
          '이름은 전 서버를 통틀어 하나이며, 다른 서버에 같은 이름이 있으면 사용할 수 없다.',
          `등록한 신청은 ${fmtInt(GUILD_JOIN_REQUEST_TTL_DAYS)}일이 지나면 자동으로 사라진다.`,
          '정원이 멈춘 뒤에도 레벨은 계속 오르고, 길드 순위의 기준으로 남는다.',
          '혼자 남은 길드장이 탈퇴하면 그대로 해산된다.',
        ]}
      />
    </>
  );
}
