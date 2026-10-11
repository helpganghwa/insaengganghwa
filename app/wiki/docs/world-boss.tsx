import {
  WORLD_BOSS_AVATAR_BONUS,
  WORLD_BOSS_LOOT_PER_STAGE,
  WORLD_BOSS_PARTY_MAX,
  WORLD_BOSS_STAGE_BASE_HP,
  WORLD_BOSS_STAGE_GROWTH,
  WORLD_BOSS_STAY_MS,
  WORLD_BOSS_TRAIT,
  WORLD_BOSS_WEAK_BONUS,
  WORLD_BOSS_WEAK_PER_SLOT,
} from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt } from '../fmt';
import { DocLink, H2, LI, Tbl, UL, Warn } from '../ui';

/** 월드보스(docs/WORLD-BOSS.md) — 본문은 10-11 위키 검토 폼(아티팩트 KBz8hyqHbo4GA689NXB4SH) 제출본을 그대로 옮겼다. 수치는 balance 상수에서 읽는다.
 *  ⚠ 운영자가 소환한다는 사실은 유저에게 절대 노출하지 않는다(10-11 사용자) — '소환'이라는 말도 쓰지 않고 '나타난다'로만. */
export const meta: WikiDocMeta = {
  slug: 'world-boss',
  cat: '경쟁',
  title: '월드보스',
  summary: '세계지도 구역에 나타난 보스를 원정대로 토벌하고, 전리품은 구역을 점령한 길드에게.',
  sections: [
    { id: 'what', label: '개요' },
    { id: 'party', label: '원정대' },
    { id: 'battle', label: '전투' },
    { id: 'power', label: '월드보스 전투력' },
    { id: 'weak', label: '약점' },
    { id: 'traits', label: '특성' },
    { id: 'phase', label: '페이즈' },
    { id: 'reward', label: '보상' },
  ],
};

const mult = (x: number) => `${x}배`;
const n = (v: number) => v.toLocaleString('ko-KR');

export default function Doc() {
  const hours = Math.round(WORLD_BOSS_STAY_MS / 3_600_000);
  return (
    <>
      <H2 id="what">개요</H2>
      <UL>
        <LI>세계지도 구역에 월드보스가 나타나 {fmtInt(hours)}시간 머문다. 머무는 동안 원정대가 입힌 피해만큼 페이즈가 오르며 전리품이 쌓인다.</LI>
        <LI>
          원정이 종료되는 순간 쌓인 전리품은 그 구역을 점령한 길드의{' '}
          <DocLink slug="conquest" hash="tax">길드 세금</DocLink>으로 들어간다. 머무는 동안 구역 주인이 바뀌면 전리품은 새 주인에게 간다.
        </LI>
      </UL>

      <H2 id="party">원정대</H2>
      <UL>
        <LI>원정대는 그 구역을 점령한 길드의 길드원만 만들 수 있다. 참가는 누구나 신청할 수 있으며, 다른 길드원과 무소속도 원정대장이 수락하면 참가할 수 있다.</LI>
        <LI>
          원정대는 최대 {fmtInt(WORLD_BOSS_PARTY_MAX)}명이다. 원정대장은 <DocLink slug="friends">친구</DocLink>와 길드원을 초대할 수 있고, 초대받은 사람은
          신청·수락 없이 바로 참가한다.
        </LI>
        <LI>한 사람은 보스 한 마리에 한 번만 싸울 수 있다. 여러 원정대에 동시에 신청할 수는 있지만, 한 곳에 들어가면 나머지 신청은 사라진다.</LI>
        <LI>원정대장은 출발 전에 대원을 내보낼 수 있다. 내보내진 사람은 그 원정대에는 다시 신청할 수 없고, 다른 원정대에는 신청할 수 있다.</LI>
        <LI>원정대장이 출발을 누르면 전투가 곧바로 치러지고 결과가 정해진다. 출발 뒤에는 원정대를 바꿀 수 없다.</LI>
      </UL>
      <Warn>모집 중인 원정대는 원정대장이 해산할 수 있고, 보스가 떠나면 자동으로 해산된다. 해산해도 다시 만들거나 다른 원정대에 참가할 수 있다.</Warn>

      <H2 id="battle">전투</H2>
      <UL>
        <LI>전투는 라운드제다. 살아 있는 원정대원이 모두 한 번씩 공격한 뒤 보스가 원정대원 한 명을 쓰러뜨린다. 모두 쓰러질 때까지 이어진다.</LI>
        <LI>원정대원이 많을수록 각자 공격하는 횟수가 늘어난다.</LI>
      </UL>

      <H2 id="power">월드보스 전투력</H2>
      <UL>
        <LI>
          장착한 장비 3개 각각의 <DocLink slug="combat-power">전투력</DocLink>을 더한 값이다. 부위마다 보너스가 붙는다.
        </LI>
      </UL>
      <Tbl
        head={['보너스', '조건', '크기']}
        rows={[
          ['아바타', '대표 아바타를 만들 때 입었던 장비와 같은 장비를 그 부위에 장착', `+${bpPct(WORLD_BOSS_AVATAR_BONUS * 10_000)}`],
          ['약점', '보스의 약점 장비를 장착', `+${bpPct(WORLD_BOSS_WEAK_BONUS * 10_000)} (치명 약점 특성이면 +${bpPct(WORLD_BOSS_TRAIT.fatalWeakBonus * 10_000)})`],
        ]}
        firstColNowrap
      />
      <UL>
        <LI>두 보너스는 합해진다. 둘 다 적용된 부위는 +{bpPct((WORLD_BOSS_AVATAR_BONUS + WORLD_BOSS_WEAK_BONUS) * 10_000)}다.</LI>
      </UL>

      <H2 id="weak">약점</H2>
      <UL>
        <LI>
          보스마다 부위별로 약점 장비가 정해져 있다. 기본은 부위마다 {fmtInt(WORLD_BOSS_WEAK_PER_SLOT)}개이며, 넓어진 약점 특성이면{' '}
          {fmtInt(WORLD_BOSS_TRAIT.wideWeak)}개, 치명 약점 특성이면 {fmtInt(WORLD_BOSS_TRAIT.fatalWeak)}개다.
        </LI>
        <LI>약점은 누군가 그 장비를 끼고 공격해 맞혀야 공개된다. 공개된 약점은 보스 상세의 약점 패널에 그림으로 보인다.</LI>
        <LI>약점 장비를 2개 이상 장착하고 공격하면 공격 보상을 얻을 확률이 올라간다.</LI>
      </UL>

      <H2 id="traits">특성</H2>
      <UL>
        <LI>보스마다 나타날 때 특성이 0~2개 붙는다.</LI>
      </UL>
      <Tbl
        head={['특성', '효과']}
        rows={[
          ['연합 원정', `원정대에 길드가 2곳이면 피해 ${mult(WORLD_BOSS_TRAIT.alliance2)}, 3곳 이상이면 ${mult(WORLD_BOSS_TRAIT.alliance3)}`],
          ['한 깃발 아래', `가장 많은 길드의 인원 1명당 +${bpPct(WORLD_BOSS_TRAIT.bannerPer * 10_000)}, ${fmtInt(WORLD_BOSS_PARTY_MAX)}명이 모두 같은 길드면 ${mult(WORLD_BOSS_TRAIT.bannerFull)}`],
          ['소수 정예', `${fmtInt(WORLD_BOSS_TRAIT.eliteMax)}명 이하로 출발하면 피해 ${mult(WORLD_BOSS_TRAIT.eliteMult)}, 공격 보상 ${mult(WORLD_BOSS_TRAIT.eliteRewardMult)}`],
          ['대군', `${fmtInt(WORLD_BOSS_PARTY_MAX)}명을 꽉 채워 출발하면 피해 ${mult(WORLD_BOSS_TRAIT.legionMult)}`],
          ['떠도는 바람', `무소속 대원의 피해 ${mult(WORLD_BOSS_TRAIT.wandererMult)}`],
          ['넓어진 약점', `약점이 부위별 ${fmtInt(WORLD_BOSS_TRAIT.wideWeak)}개`],
          ['치명 약점', `약점이 부위별 ${fmtInt(WORLD_BOSS_TRAIT.fatalWeak)}개, 약점 보너스 +${bpPct(WORLD_BOSS_TRAIT.fatalWeakBonus * 10_000)}`],
          ['황금 깃털', '공격 보상에서 꽝이 나올 확률이 줄어든다'],
          ['무거운 보물', `페이즈 전리품 +${bpPct((WORLD_BOSS_TRAIT.heavyLoot - 1) * 10_000)}`],
        ]}
        firstColNowrap
      />

      <H2 id="phase">페이즈</H2>
      <UL>
        <LI>
          보스의 피해 누적이 페이즈 체력을 넘길 때마다 페이즈가 오른다. 1페이즈 체력은 {n(WORLD_BOSS_STAGE_BASE_HP / 10_000)}만이고 페이즈마다{' '}
          {bpPct((WORLD_BOSS_STAGE_GROWTH - 1) * 10_000)}씩 늘어나며, 상한은 없다.
        </LI>
        <LI>
          페이즈가 오를 때마다 전리품이 💎{n(WORLD_BOSS_LOOT_PER_STAGE.diamond)}·📦{n(WORLD_BOSS_LOOT_PER_STAGE.boxes)}씩 쌓인다. 무거운 보물 특성이면{' '}
          {bpPct((WORLD_BOSS_TRAIT.heavyLoot - 1) * 10_000)}가 추가된다.
        </LI>
      </UL>

      <H2 id="reward">보상</H2>
      <UL>
        <LI>원정대원은 공격할 때마다 보상을 얻을 수 있다. 다이아 또는 상자 또는 꽝 중 하나이며, 피해량과는 관계없다. 공격 횟수가 많을수록 기회가 늘어난다.</LI>
        <LI>원정대원 공격 보상의 합계는 전투 직후 원정 보상 우편으로 받는다.</LI>
        <LI>원정이 종료되는 순간 쌓인 전리품(💎·📦)은 그 구역을 점령한 길드의 세금으로 쌓인다.</LI>
      </UL>
      <Warn>종료 시 구역이 중립이면 전리품은 사라진다.</Warn>
    </>
  );
}
