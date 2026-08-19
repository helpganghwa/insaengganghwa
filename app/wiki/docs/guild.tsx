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
import { DocLink, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'guild',
  cat: '길드',
  title: '길드 기본',
  summary: '결성과 가입, 기부로 오르는 레벨과 정원, 나갈 때 걸리는 잠금.',
  sections: [
    { id: 'create', label: '길드 만들기' },
    { id: 'join', label: '가입' },
    { id: 'donate', label: '기부' },
    { id: 'level', label: '레벨과 정원' },
    { id: 'leave', label: '탈퇴' },
    { id: 'disband', label: '해산' },
  ],
};

/** 회차별 기부 비용 — 무료 회차는 금액 대신 '무료'로. */
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
      <H2 id="create">길드 만들기</H2>
      <P>
        결성 비용은 {fmtInt(GUILD_CREATE_COST_DIAMOND)}다이아다. 한 서버에서 소속할 수 있는 길드는
        하나뿐이라, 이미 어딘가에 들어가 있으면 만들 수 없다. 만든 사람이 길드장이 되고 가입 방식은
        승인제로 시작한다.
      </P>
      <UL>
        <LI>
          이름은 {fmtInt(GUILD_NAME_MIN_LEN)}~{fmtInt(GUILD_NAME_MAX_LEN)}자, 한글·영문·숫자만 쓴다.
          공백과 특수문자는 들어가지 않는다.
        </LI>
        <LI>이름은 전 서버를 통틀어 하나뿐이다. 다른 서버에 같은 이름이 있으면 결성이 막힌다.</LI>
        <LI>
          문양은 결성할 때 한 장이 무료로 나온다. 이후로는 새로 뽑을 때마다{' '}
          {fmtInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)}다이아가 들고, {fmtInt(MAX_GUILD_EMBLEMS)}장까지
          보관한다.
        </LI>
      </UL>

      <H2 id="join">가입</H2>
      <P>
        가입 방식은 자유와 승인 둘 중 하나다. 자유면 목록에서 누르는 즉시 들어가고, 승인이면 신청이
        걸린 뒤 가입 관리 권한을 가진 사람이 받거나 물린다. 어느 쪽이든 정원이 차 있으면 들어가지
        못한다.
      </P>
      <P>
        신청은 한 번에 한 곳만 걸린다. 다른 길드에 신청하면 앞의 신청이 그리로 옮겨 가고, 걸어둔 지{' '}
        {fmtInt(GUILD_JOIN_REQUEST_TTL_DAYS)}일이 지나면 목록에서 사라진다. 길드에 들어가거나 직접
        결성하면 남아 있던 신청은 정리된다.
      </P>

      <H2 id="donate">기부</H2>
      <P>
        기부는 하루 {fmtInt(GUILD_DONATIONS_PER_DAY)}번, 한국 시간 자정에 다시 찬다. 회차가 올라갈수록
        비용이 오른다({DONATION_COSTS}). 얻는 값은 회차와 상관없이{' '}
        {fmtInt(GUILD_DONATION_TIERS[0].xp)}으로 같으니, 뒤 회차는 같은 것을 비싸게 사는 셈이다.
      </P>
      <P>
        기부 한 번은 길드 경험치와 개인 기여도에 같은 값으로 동시에 쌓인다. 기여도는 길드 안에
        누적으로 남고, 길드장이 오래 접속하지 않을 때 누가 자리를 넘겨받는지를 가르는 기준이 된다.
      </P>

      <H2 id="level">레벨과 정원</H2>
      <P>
        레벨은 기부로만 오른다. 다음 레벨까지 필요한 경험치가 {fmtInt(GUILD_XP_PER_LEVEL_STEP)}씩
        늘어나는 구조라, 뒤로 갈수록 한 레벨에 걸리는 날이 길어진다.
      </P>
      <P>
        정원은 {fmtInt(GUILD_BASE_CAPACITY)}명에서 시작해 레벨 하나당 한 자리씩 늘고{' '}
        {fmtInt(GUILD_MAX_CAPACITY)}명에서 멈춘다. 정원이 멈춘 뒤에도 레벨은 계속 오르며, 길드 순위의
        기준으로 남는다.
      </P>
      <Tbl head={['레벨', '정원', '누적 기부 경험치']} rows={CAP_ROWS} />
      <Note>
        기부는 길드원이 각자 넣는다. 정원이 클수록 하루에 들어오는 경험치도 커지므로, 사람이 붙을수록
        레벨이 빨라지고 레벨이 오를수록 자리가 늘어난다.
      </Note>

      <H2 id="leave">탈퇴</H2>
      <P>
        길드원은 언제든 나갈 수 있다. 나가는 순간 점령전에서 맡고 있던 집행관 자리와 아직 치르지 않은
        배치가 함께 풀린다. 이미 끝난 전투 기록은 그대로 남는다.
      </P>
      <Warn>
        탈퇴하거나 추방당하면 그 서버에서 {fmtInt(GUILD_REJOIN_LOCK_HOURS)}시간 동안 어떤 길드에도
        들어가지 못한다. 원래 길드로 되돌아가는 것도 막힌다.
      </Warn>
      <P>
        길드장은 길드원이 남아 있는 동안 탈퇴가 막힌다. 자리를 넘기거나 해산해야 나갈 수 있다. 길드장
        혼자 남은 상태에서 탈퇴하면 그대로 해산으로 처리된다.
      </P>

      <H2 id="disband">해산</H2>
      <P>
        해산은 길드장만 한다. 길드원 동의를 묻지 않고, 남은 사람들에게 미리 알림이 가지도 않는다.
      </P>
      <Warn>
        해산하면 보유 구역이 전부 중립으로 풀리고 길드 세금 풀은 사라진다. 문양과 길드 기록도 함께
        지워지며 되돌릴 방법은 없다.
      </Warn>
      <P>
        길드장이 오래 접속하지 않고 자리를 넘겨받을 사람도 없으면 길드는 자동으로 해산된다. 이 경우엔
        전원에게 해산 우편이 간다. 판정 기준은{' '}
        <DocLink slug="guild-roles">길드 권한</DocLink> 쪽에 있다.
      </P>

      <Note>
        직책별로 무엇을 할 수 있는지는 <DocLink slug="guild-roles">길드 권한</DocLink>, 길드가 땅과
        세금을 얻는 쪽은 <DocLink slug="conquest">점령전</DocLink>, 길드원을 불러 함께 잡는 보스는{' '}
        <DocLink slug="raid">레이드</DocLink>에 있다.
      </Note>
    </>
  );
}
