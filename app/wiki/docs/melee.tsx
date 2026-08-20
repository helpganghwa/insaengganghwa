import {
  MELEE_DIAMOND_PCT_CUTOFF,
  MELEE_DMG_MAX,
  MELEE_DMG_MIN,
  MELEE_HP_MULT,
  MELEE_REPLAY_ROUNDS,
  MELEE_REWARD_TIERS,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'melee',
  cat: '경쟁',
  title: '대난투',
  summary: '매일 아침 전투력만으로 치러지는 전원 난투, 등수대로 보상과 포인트.',
  sections: [
    { id: 'join', label: '참가' },
    { id: 'time', label: '일정' },
    { id: 'battle', label: '전투' },
    { id: 'reward', label: '보상' },
    { id: 'point', label: '포인트' },
    { id: 'result', label: '결과' },
  ],
};

// 산출 9시 · 발표 10시 — balance 상수가 아니라 배포 크론 일정이 원천이다
// (vercel.json: melee-run UTC 0시 / melee-reveal UTC 1시 = KST 9시 / 10시).
const RUN_KST_HOUR = 9;
const REVEAL_KST_HOUR = 10;

/** 데미지 계수는 배수(0.5·1.2)라 bp로 환산해 퍼센트로 렌더한다. */
const ratioPct = (ratio: number) => bpPct(ratio * 10_000);

export default function Doc() {
  return (
    <>
      <H2 id="join">참가</H2>
      <UL>
        <LI>
          <DocLink slug="combat-power" hash="total">
            전투력
          </DocLink>
          이 있으면 매일 자동으로 참가된다. 따로 신청하지 않는다.
          <Fn n={1} />
        </LI>
        <LI>하루 한 번 열리며, 회차는 제1회부터 이어진다.</LI>
        <LI>대난투는 서버마다 따로 열린다.</LI>
        <LI>회차와 참가 인원은 대난투 화면 위쪽에 표시된다.</LI>
      </UL>

      <H2 id="time">일정</H2>
      <UL>
        <LI>
          {fmtInt(RUN_KST_HOUR)}시에 그날 전투가 치러지고, {fmtInt(REVEAL_KST_HOUR)}시에 결과가
          발표된다.
        </LI>
        <LI>발표 전에는 남은 시간과 진행 상태가 표시되고, 결과는 발표 뒤에 열린다.</LI>
        <LI>
          전투에 쓰이는 전투력은 {fmtInt(RUN_KST_HOUR)}시 시점 값으로 굳는다. 그 뒤에 올린 전투력은
          다음 회차부터 반영된다.
        </LI>
        <LI>
          그래서 그날 순위를 올리려면 {fmtInt(RUN_KST_HOUR)}시 전에{' '}
          <DocLink slug="enhance" hash="result">
            강화 결과
          </DocLink>
          를 받아 두는 것이 좋다.
        </LI>
      </UL>

      <H2 id="battle">전투</H2>
      <UL>
        <LI>시작 체력은 총 전투력의 {fmtInt(MELEE_HP_MULT)}배.</LI>
        <LI>한 라운드에 한 명이 한 명을 한 번 때리고, 공격은 항상 맞는다.</LI>
        <LI>
          한 대의 피해는 때리는 사람 전투력의 {ratioPct(MELEE_DMG_MIN)}에서{' '}
          {ratioPct(MELEE_DMG_MAX)} 사이에서 정해진다.
        </LI>
        <LI>맞고 버틴 사람이 다음 공격자가 된다. 반격이 이어지는 구조.</LI>
        <LI>상대를 쓰러뜨리면 그 흐름이 끊기고, 다음 공격자가 새로 뽑힌다.</LI>
        <LI>먼저 쓰러진 사람이 꼴찌부터 등수를 채우고, 끝까지 남은 한 명이 우승.</LI>
        <LI>
          체력과 피해가 모두 전투력에서 나오므로, 전투력이 높을수록 오래 버티고 크게 때린다.
        </LI>
        <LI>순위표에는 공격 성공과 방어 성공, 탈락한 라운드와 나를 쓰러뜨린 상대가 남는다.</LI>
      </UL>
      <Note>
        공격 성공은 내가 쓰러뜨린 수, 방어 성공은 맞고도 버텨낸 수다. 우승자는 탈락 라운드 대신 최후
        생존으로 표시된다.
      </Note>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>
          등수 구간에 따라 다이아와 <DocLink slug="supply">보급 상자</DocLink>, 랭킹 포인트를 받는다.
        </LI>
        <LI>상자는 무기 · 방어구 · 장신구로 나뉘어 들어온다.</LI>
        <LI>
          다이아는 참가자 상위 {fmtInt(MELEE_DIAMOND_PCT_CUTOFF * 100)}%까지만 지급되고, 그 아래
          순위는 상자와 포인트만 받는다.
          <Fn n={2} />
        </LI>
        <LI>
          보상은 {fmtInt(REVEAL_KST_HOUR)}시 발표와 함께 우편으로 들어오며, 우편함에서 받아야
          지급된다.
        </LI>
      </UL>
      <Tbl
        head={['순위', '다이아', '상자', '포인트']}
        rows={MELEE_REWARD_TIERS.map((t) => [
          t.label,
          t.diamond > 0 ? fmtInt(t.diamond) : '—',
          fmtInt(t.boxes),
          t.points > 0 ? `+${fmtInt(t.points)}` : '—',
        ])}
      />
      <Note>위에서부터 먼저 걸리는 구간 하나가 적용된다. 순위 구간을 다 지나면 비율 구간이 잡힌다.</Note>
      <Warn>보상 우편은 기한이 지나면 사라진다. 받지 않은 보상은 그대로 없어진다.</Warn>

      <H2 id="point">포인트</H2>
      <UL>
        <LI>
          위 표의 포인트가 <DocLink slug="ranking" hash="metric">랭킹</DocLink>의 대난투 지표에
          쌓인다.
        </LI>
        <LI>오래된 성적일수록 반영 비중이 줄어, 최근 성적이 크게 반영된다.</LI>
        <LI>통산 우승 횟수는 포인트와 별개로 쌓인다.</LI>
        <LI>1~3위는 월드 소식에 오르고, 우승자는 홈 화면에 표시된다.</LI>
      </UL>

      <H2 id="result">결과</H2>
      <UL>
        <LI>결과 화면은 전체 순위 · 전체 전투 · 내 전투 세 탭.</LI>
        <LI>
          전체 순위는 참가자 전원을 등수 순으로 보여준다. 전체와 우리 길드로 나눠 볼 수 있고, 내
          순위 버튼으로 내 자리까지 이동한다.
        </LI>
        <LI>
          전체 전투는 라운드 기록이며, 한 줄을 누르면 그 장면이 무대에서 재생된다. 전체 재생과 배속도
          쓸 수 있다.
        </LI>
        <LI>내 전투는 내가 때리거나 맞은 라운드만 모아 보여준다.</LI>
        <LI>
          라운드가 아주 많은 회차는 마지막 {fmtInt(MELEE_REPLAY_ROUNDS)}전만 남는다.
          <Fn n={3} />
        </LI>
        <LI>역대 우승자에서 지난 회차를 골라 그날 결과를 다시 볼 수 있다.</LI>
      </UL>

      <FnList
        notes={[
          '장비가 하나도 없어 전투력이 0이면 그 회차 참가자에서 빠진다.',
          '이 비율은 표의 순위 구간과 따로 적용된다. 참가자가 적은 회차에서는 표에 다이아가 적힌 구간에 들어도 0을 받을 수 있다.',
          '전체 전투가 잘린 회차라도 내 전투 탭에는 내가 낀 라운드가 남는다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="combat-power">전투력</DocLink>,{' '}
        <DocLink slug="ranking">랭킹</DocLink>, <DocLink slug="supply">보급</DocLink>.
      </P>
    </>
  );
}
