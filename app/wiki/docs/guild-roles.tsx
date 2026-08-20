import {
  GUILD_INTRO_MAX_LEN,
  GUILD_LEADER_HANDOVER_DAYS,
  GUILD_LEADER_HANDOVER_WARN_DAYS,
  GUILD_MAX_VICE,
  GUILD_NOTICE_MAX_LEN,
  GUILD_REJOIN_LOCK_HOURS,
} from '@/lib/game/guild/balance';
import {
  GUILD_PERM,
  GUILD_PERM_CONFIRM,
  GUILD_PERM_DEFAULT,
  GUILD_PERM_META,
  GUILD_PERM_ORDER,
} from '@/lib/game/guild/permissions';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'guild-roles',
  cat: '길드',
  title: '길드 권한',
  summary: '직책과 부길드장 권한, 추방, 길드장 자동 위임.',
  sections: [
    { id: 'roles', label: '직책' },
    { id: 'perms', label: '부길드장 권한' },
    { id: 'leader-only', label: '길드장 전속' },
    { id: 'kick', label: '추방' },
    { id: 'handover', label: '자동 위임' },
  ],
};

/** 권한 표 — 코드의 권한 목록·기본값을 그대로 옮긴다. */
const PERM_ROWS = GUILD_PERM_ORDER.map((key) => {
  const on = (GUILD_PERM_DEFAULT & GUILD_PERM[key]) !== 0;
  return [
    GUILD_PERM_META[key].label,
    GUILD_PERM_META[key].desc ?? '',
    on ? '허용됨' : '차단됨',
  ] as const;
});

/** 켤 때 확인을 한 번 더 받는 권한 — 되돌릴 수 없거나 다이아가 나가는 것들. */
const CONFIRM_LABELS = GUILD_PERM_CONFIRM.map((k) => GUILD_PERM_META[k].label).join(', ');

export default function Doc() {
  return (
    <>
      <H2 id="roles">직책</H2>
      <UL>
        <LI>직책은 길드장·부길드장·길드원 셋이며, 길드장은 한 명이고 모든 권한을 가진다.</LI>
        <LI>
          부길드장은 {fmtInt(GUILD_MAX_VICE)}명까지 둘 수 있고, 할 수 있는 일은 길드장이 사람마다
          허용한 만큼이다.
          <Fn n={1} />
        </LI>
      </UL>

      <H2 id="perms">부길드장 권한</H2>
      <UL>
        <LI>허용할 수 있는 권한은 {fmtInt(GUILD_PERM_ORDER.length)}가지이고 하나씩 따로 켜고 끈다.</LI>
        <LI>
          표의 마지막 칸은 임명 직후 부길드장이 기본으로 갖는 상태이며, 길드장은 이것도 끌 수 있다.
        </LI>
      </UL>
      <Tbl head={['권한', '내용', '임명 직후']} rows={PERM_ROWS} />
      <UL>
        <LI>
          {GUILD_PERM_META.deploy.label}는 다른 길드원의{' '}
          <DocLink slug="conquest" hash="deploy">배치</DocLink>를 해제하는 권한이며, 배치를 넣는 것은
          언제나 본인이다.
        </LI>
        <LI>
          <DocLink slug="conquest" hash="executor">{GUILD_PERM_META.executor.label}</DocLink>에는 그
          구역 <DocLink slug="conquest" hash="tax">세금 수금</DocLink> 권한이 함께 포함된다.
        </LI>
        <LI>
          공지는 {fmtInt(GUILD_NOTICE_MAX_LEN)}자, 소개는 {fmtInt(GUILD_INTRO_MAX_LEN)}자까지
          작성한다. 소개는 <DocLink slug="guild" hash="join">길드 목록</DocLink>에서 누구나 볼 수
          있다.
        </LI>
      </UL>
      <Note>{CONFIRM_LABELS}은 켤 때 확인을 한 번 더 받는다.</Note>

      <H2 id="leader-only">길드장 전속</H2>
      <P>다음은 부길드장에게 허용할 수 없다.</P>
      <UL>
        <LI>부길드장 임명·해제</LI>
        <LI>부길드장 권한 설정</LI>
        <LI>
          길드장 위임
          <Fn n={2} />
        </LI>
        <LI>
          길드 <DocLink slug="guild" hash="disband">해산</DocLink>
        </LI>
      </UL>

      <H2 id="kick">추방</H2>
      <UL>
        <LI>
          추방은 추방 권한을 가진 사람이 한다.
          <Fn n={3} />
        </LI>
        <LI>
          추방된 사람이 맡고 있던 집행관 자리와 넣어둔 배치는 함께 풀린다.
        </LI>
      </UL>
      <Warn>
        추방은 되돌릴 수 없다. 추방당한 사람에게 {fmtInt(GUILD_REJOIN_LOCK_HOURS)}시간{' '}
        <DocLink slug="guild" hash="leave">재가입 잠금</DocLink>이 걸리므로, 잘못 눌렀어도 바로 다시
        가입시킬 수 없다.
      </Warn>

      <H2 id="handover">자동 위임</H2>
      <UL>
        <LI>
          길드장이 접속하지 않으면 자리가 위임된다. {fmtInt(GUILD_LEADER_HANDOVER_WARN_DAYS)}일째에
          경고 우편이 발송되고, {fmtInt(GUILD_LEADER_HANDOVER_DAYS)}일이 되면 위임이 실행된다.
          <Fn n={4} />
        </LI>
        <LI>
          위임 대상은 최근 {fmtInt(GUILD_LEADER_HANDOVER_DAYS)}일 안에 접속한 길드원 중에서
          정해진다. 부길드장이 우선이며, 그다음은{' '}
          <DocLink slug="guild" hash="donate">기여도</DocLink> 순이다.
        </LI>
        <LI>길드장이 오래 자리를 비울 예정이면 미리 위임해 두는 것이 좋다.</LI>
      </UL>
      <Warn>
        넘겨받을 길드원이 하나도 없으면 위임 대신 길드가 해산된다. 보유{' '}
        <DocLink slug="conquest" hash="abandon">구역</DocLink>은 중립이 되고 모아둔 세금은 사라지며,
        전원에게 해산 우편이 발송된다.
      </Warn>

      <FnList
        notes={[
          '부길드장을 해제하면 허용한 권한도 함께 사라진다. 다시 임명하면 기본값에서 다시 시작한다.',
          '위임은 같은 길드의 길드원 한 명을 지목해 자리를 맞바꾸는 것이다. 자리를 넘긴 사람은 길드원으로 남는다.',
          '부길드장 추방은 길드장만 한다.',
          '그 사이에 길드장이 접속하면 경고는 지워지고 처음부터 다시 센다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="guild">길드 기본</DocLink>,{' '}
        <DocLink slug="conquest">점령전</DocLink>.
      </P>
    </>
  );
}
