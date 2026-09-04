import {
  MELEE_DIAMOND_PCT_CUTOFF,
  MELEE_DMG_MAX,
  MELEE_DMG_MIN,
  MELEE_HP_MULT,
  MELEE_REPLAY_ROUNDS,
  MELEE_REWARD_TIERS,
  MELEE_KILL_DIAMOND,
  MELEE_DEFENSE_BOX,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, Tbl, UL, Warn } from '../ui';

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
      </UL>

      <H2 id="time">일정</H2>
      <UL>
        <LI>
          {fmtInt(RUN_KST_HOUR)}시에 그날 전투가 치러지고, {fmtInt(REVEAL_KST_HOUR)}시에 결과가
          발표된다.
        </LI>
        <LI>
          전투에 반영되는 전투력은 {fmtInt(RUN_KST_HOUR)}시 시점 값으로 진행된다. 그 뒤에 올린
          전투력은 다음 회차부터 반영된다.
        </LI>
      </UL>

      <H2 id="battle">전투</H2>
      <UL>
        <LI>시작 체력은 총 전투력의 {fmtInt(MELEE_HP_MULT)}배.</LI>
        <LI>첫 라운드에는 무작위 한 명이 무작위 한 명을 공격한다.</LI>
        <LI>
          공격력은 공격하는 사람 전투력의 {ratioPct(MELEE_DMG_MIN)}에서 {ratioPct(MELEE_DMG_MAX)}{' '}
          사이에서 랜덤으로 정해진다.
        </LI>
        <LI>공격을 당하고 버티면 다음 공격자가 된다.</LI>
        <LI>
          공격을 버티지 못해 쓰러지면 공격자와 방어자가 다시 무작위로 선정되어 다음 라운드가
          이어진다.
        </LI>
        <LI>먼저 쓰러진 사람이 뒤에서부터 등수를 채우고, 끝까지 남은 한 명이 우승한다.</LI>
        <LI>체력과 피해가 모두 전투력에서 나오므로, 전투력이 높을수록 오래 버틸 확률이 높다.</LI>
        <LI>순위표에는 공격 성공과 방어 성공, 탈락한 라운드와 나를 쓰러뜨린 상대가 기록된다.</LI>
      </UL>
      <Note>공격 성공은 내가 쓰러뜨린 수, 방어 성공은 맞고도 버텨낸 수다.</Note>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>
          등수 구간에 따라 다이아와 <DocLink slug="supply">보급 상자</DocLink>, 랭킹 포인트를 받는다.
        </LI>
        <LI>상자는 무기 · 방어구 · 장신구가 균등하게 지급된다.</LI>
        <LI>
          공격·방어 보너스: 등수와 상관없이 공격 성공(내 공격으로 상대를 쓰러뜨림) 1회마다{' '}
          {fmtInt(MELEE_KILL_DIAMOND)} 다이아, 방어 성공(공격을 받고도 버팀) 1회마다 보급 상자{' '}
          {fmtInt(MELEE_DEFENSE_BOX)}개가 더해진다. 결과 우편의 다이아·상자에 합쳐져 들어오며, 내 횟수와
          보너스는 결과 화면의 내 전투에서 확인할 수 있다.
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
      <Tbl
        head={['공격·방어 보너스', '다이아', '상자']}
        rows={[
          ['공격 성공 1회 (상대를 쓰러뜨림)', fmtInt(MELEE_KILL_DIAMOND), '—'],
          ['방어 성공 1회 (공격받고 버팀)', '—', fmtInt(MELEE_DEFENSE_BOX)],
        ]}
      />
      <Warn>
        다이아는 참가자 상위 {Math.round(MELEE_DIAMOND_PCT_CUTOFF * 100)}%까지만 지급된다 — 그
        아래 순위는 표의 다이아 없이 상자와 포인트만 받는다.
      </Warn>
      <Warn>보상 우편은 기한이 지나면 사라진다. 받지 않은 보상은 그대로 없어진다.</Warn>

      <H2 id="point">포인트</H2>
      <UL>
        <LI>
          표의 포인트가 <DocLink slug="ranking" hash="metric">랭킹</DocLink>의 대난투 지표에
          반영된다.
        </LI>
        <LI>오래된 성적은 작게 반영되고 최근 성적이 크게 반영된다.</LI>
        <LI>통산 우승 횟수는 포인트와 별개로 기록된다.</LI>
        <LI>1~3위는 월드 소식과 채팅에 오르고, 우승자는 다음 회차까지 홈 화면에 표시된다.</LI>
      </UL>

      <H2 id="result">결과</H2>
      <UL>
        <LI>결과 화면은 전체 순위 · 전체 전투 · 내 전투 세 탭으로 구성되어 있다.</LI>
        <LI>
          전체 순위는 참가자 전원을 등수 순으로 보여준다. 전체와 우리 길드로 나눠 볼 수 있고, 내
          순위 버튼으로 내 순위까지 이동한다.
        </LI>
        <LI>
          전체 전투는 라운드 기록이며, 한 줄을 누르면 그 장면이 무대에서 재생된다. 전체 재생과 배속도
          쓸 수 있다.
        </LI>
        <LI>내 전투는 내가 때리거나 맞은 라운드만 모아 보여준다.</LI>
        <LI>라운드 기록은 최대 {fmtInt(MELEE_REPLAY_ROUNDS)}전만 기록된다.</LI>
        <LI>역대 우승자에서 지난 회차를 골라 그날 결과를 다시 조회할 수 있다.</LI>
      </UL>

      <FnList notes={['장비가 하나도 없어 전투력이 0이면 그 회차 참가자에서 제외된다.']} />
    </>
  );
}
