import {
  CONQUEST_BATTLE_KST_HOUR,
  CONQUEST_DMG_MAX,
  CONQUEST_DMG_MIN,
  CONQUEST_HP_MULT,
  GUILD_EXECUTOR_TAX_CUT,
  GUILD_FULL_REGION_TAX_BONUS,
  GUILD_ZONE_TAX_BONUS,
  TAX_COLLECT_COOLDOWN_MIN,
  TAX_MELEE_PRIZE_RATE,
  TAX_POINTS_PER_DIAMOND,
  TAX_POINTS_PER_DIAMOND_SPENT,
  conquestPowerMult,
} from '@/lib/game/guild/balance';
import { REGION_META } from '@/lib/game/guild/region-meta';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'conquest',
  cat: '길드',
  title: '점령전',
  summary: '하루 한 번 진행되는 구역 다툼, 집행관과 세금, 방치하면 줄어드는 세금.',
  sections: [
    { id: 'day', label: '진행 시각' },
    { id: 'residence', label: '거주지' },
    { id: 'deploy', label: '배치' },
    { id: 'battle', label: '전투' },
    { id: 'executor', label: '집행관' },
    { id: 'tax', label: '세금' },
    { id: 'abandon', label: '방치 페널티' },
    { id: 'chronicle', label: '연대기' },
  ],
};

/** 잠금이 풀리는 시각 — 정산 시각 다음다음 시(자정을 넘긴다). */
const UNLOCK_HOUR = (CONQUEST_BATTLE_KST_HOUR + 2) % 24;

/** 역할별 유효 전투력 — 장비 전투력에 곱하는 배수를 백분율로. */
const POWER_ROWS = [
  ['공격', bpPct(conquestPowerMult('attack', false) * 10_000)],
  ['수비', bpPct(conquestPowerMult('defend', false) * 10_000)],
  ['집행관', bpPct(conquestPowerMult('defend', true) * 10_000)],
] as const;

const REGION_COUNT = Object.keys(REGION_META).length;

export default function Doc() {
  return (
    <>
      <H2 id="day">진행 시각</H2>
      <UL>
        <LI>
          배치는 {fmtInt(CONQUEST_BATTLE_KST_HOUR)}시에 마감된다. 그날 전투 결과는 자정에 발표되며,
          이때 구역 소유권이 바뀌고 결과 우편이 발송된다.
        </LI>
        <LI>
          {fmtInt(CONQUEST_BATTLE_KST_HOUR)}시부터 {fmtInt(UNLOCK_HOUR)}시까지는 배치와 배치 해제,
          집행관 지정이 제한된다. 배치나 집행관이 있는 상태면 거주지 이동도 함께 제한된다.
        </LI>
      </UL>

      <H2 id="residence">거주지</H2>
      <UL>
        <LI>구역에 배치하거나 집행관을 맡으려면 그 구역에 거주해야 한다.</LI>
        <LI>세계지도에서 직접 거주지를 옮길 수 있다.</LI>
        <LI>이동은 맞닿은 구역으로만 가능하며, 대기 시간 없이 연속으로 옮길 수 있다.</LI>
        <LI>세금은 거주지에 쌓이며, 거주지를 옮기면 옮긴 곳에서 다시 세금이 쌓인다.</LI>
      </UL>
      <Warn>
        배치나 집행관 자리를 가진 채 거주지를 옮기면 그 역할이 해제된다. 다른 수비를 남기지 않고
        이동하면 그날 방치로 처리돼 다음 날 세율 계산에서 빠진다.
      </Warn>

      <H2 id="deploy">배치</H2>
      <UL>
        <LI>
          하루에 배치할 수 있는 구역은 한 곳이며, 공격이나 수비 중 하나를 선택한다.
          <Fn n={1} />
        </LI>
        <LI>
          수비는 자기 <DocLink slug="guild">길드</DocLink>가 이미 점령한 구역에만 배치할 수 있다.
        </LI>
        <LI>
          공격은 자기 길드 소유가 아닌 구역에 배치하되, 자기 길드 구역과 맞닿아 있어야 한다.
          <Fn n={2} />
        </LI>
        <LI>주인 없는 중립 구역과 방치된 구역은 맞닿아 있지 않아도 공격할 수 있다.</LI>
        <LI>
          길드원의 배치를 해제하는 것은{' '}
          <DocLink slug="guild-roles" hash="perms">별도 권한</DocLink>이다.
        </LI>
      </UL>

      <H2 id="battle">전투</H2>
      <UL>
        <LI>전투는 공격 배치가 하나라도 있는 구역에서만 진행된다.</LI>
        <LI>참가자는 그 구역의 공격·수비 배치와 집행관이다.</LI>
        <LI>
          장비 <DocLink slug="combat-power">전투력</DocLink>에 역할 배수를 곱한 값이 유효 전투력이며,
          체력과 공격력 모두 유효 전투력으로 산출된다.
        </LI>
      </UL>
      <Tbl head={['역할', '유효 전투력']} rows={POWER_ROWS} />
      <UL>
        <LI>체력은 유효 전투력의 {fmtInt(CONQUEST_HP_MULT)}배이다.</LI>
        <LI>
          한 번의 공격으로 들어가는 피해는 공격하는 쪽 유효 전투력의{' '}
          {bpPct(CONQUEST_DMG_MIN * 10_000)}에서 {bpPct(CONQUEST_DMG_MAX * 10_000)} 사이에서 랜덤으로
          정해진다.
        </LI>
        <LI>같은 길드끼리는 전투하지 않으며, 한 길드의 인원만 남는 순간 그 길드가 승리한다.</LI>
        <LI>승리한 길드가 원래 소유 길드와 다르면 자정에 구역 소유권이 넘어간다.</LI>
        <LI>
          지켜낸 구역의 수비 배치만 다음 날에 이어지며, 공격 배치는 성공 여부와 상관없이 다음 날
          자동으로 해제된다.
        </LI>
      </UL>

      <H2 id="executor">집행관</H2>
      <UL>
        <LI>
          구역마다 한 명이며, 집행관 지정 권한자가 그 구역에 수비 배치된 길드원 중에서 지정한다.
          <Fn n={3} />
        </LI>
        <LI>
          집행관은 구역 수비로 참여하며, 유효 전투력이{' '}
          {bpPct(conquestPowerMult('defend', true) * 10_000)}로 적용된다.
        </LI>
        <LI>집행관에게는 세금 수금 권한도 함께 주어진다.</LI>
        <LI>
          길드를 탈퇴하거나 추방당하면 집행관 자리는 곧바로 해제된다.
          <Fn n={4} />
        </LI>
      </UL>

      <H2 id="tax">세금</H2>
      <UL>
        <LI>세금은 거주자의 활동에서 나온다. 세 가지가 모두 거주 구역의 포인트로 쌓인다.</LI>
        <LI>강화에 성공할 때마다 도달한 강화 레벨만큼 포인트가 쌓인다.</LI>
        <LI>
          다이아를 사용할 때마다 사용한 다이아 하나당 {fmtInt(TAX_POINTS_PER_DIAMOND_SPENT)}포인트가 쌓인다.
        </LI>
        <LI>
          <DocLink slug="melee" hash="reward">대난투</DocLink> 상금의 {bpPct(TAX_MELEE_PRIZE_RATE * 10_000)}만큼이
          발표와 함께 거주 구역에 쌓인다.
        </LI>
        <LI>
          {fmtInt(TAX_POINTS_PER_DIAMOND)}포인트가 모일 때마다 다이아 하나로 전환되고, 남는 포인트는
          이월된다.
        </LI>
        <LI>
          구역을 많이 점령한 길드일수록 세율이 높다. 방치되지 않은 소유 구역 하나당{' '}
          {bpPct(GUILD_ZONE_TAX_BONUS * 10_000)}이며, {fmtInt(REGION_COUNT)}개 지역 중 하나를
          완전장악하면 그 지역마다 {bpPct(GUILD_FULL_REGION_TAX_BONUS * 10_000)}가 추가된다.
        </LI>
        <LI>세율은 그 길드의 모든 구역 누적에 곱해진다.</LI>
        <LI>
          수금은 집행관이 한다. 구역을 점령하고 {fmtMs(TAX_COLLECT_COOLDOWN_MIN * 60_000)}이 지나야
          첫 수금이 가능하고, 그 뒤로도 {fmtMs(TAX_COLLECT_COOLDOWN_MIN * 60_000)}의 쿨타임이 적용된다.
          <Fn n={5} />
        </LI>
        <LI>
          수금한 다이아 중 {bpPct(GUILD_EXECUTOR_TAX_CUT * 10_000)}는 집행관 몫으로 바로 지급되고,
          나머지 {bpPct((1 - GUILD_EXECUTOR_TAX_CUT) * 10_000)}는 길드 세금으로 모인다.
        </LI>
      </UL>
      <Note>
        분배는 세금 분배 권한자가 할 수 있다. 균등 · 기여 비례 · 오늘 기부자 · 직접 중에서 방식을 고르고,
        사람별 금액은 수정할 수 있다. 지급은 보상 우편으로 이루어진다.
      </Note>

      <H2 id="abandon">방치 페널티</H2>
      <UL>
        <LI>그날 전투에 공격도 수비도 없고 집행관도 없으면 그 구역은 방치로 처리된다.</LI>
        <LI>
          방치된 구역은 다음 점령전 발표까지 <DocLink slug="conquest" hash="tax">세율</DocLink> 계산에서
          빠진다 — 구역 수에도 세지 않고, 완전 장악 계산에서도 빠진다.
        </LI>
        <LI>방치된 구역은 맞닿아 있지 않은 길드도 공격할 수 있다.</LI>
        <LI>소유권과 쌓여 있던 세금은 그대로 유지된다. 다음 날 배치가 있으면 계산에 다시 들어간다.</LI>
      </UL>

      <H2 id="chronicle">연대기</H2>
      <UL>
        <LI>그날의 점령전은 자정에 한 편의 이야기로 묶여 세계지도에 공개된다.</LI>
        <LI>
          어느 길드가 어디를 공격했고 누가 막아냈는지 등이 그날 기록으로 남는다.
          <Fn n={6} />
        </LI>
      </UL>

      <FnList
        notes={[
          '다른 곳에 다시 배치하면 기존의 배치는 해제된다. 거주하지 않는 구역을 고르면 거주지 이동을 함께 확인한다.',
          '점령한 구역이 하나도 없는 길드는 인접 조건 없이 아무 구역이나 공격할 수 있다.',
          '한 사람이 두 구역을 맡지는 못한다.',
          '수금하지 않은 세금은 구역에 그대로 남는다.',
          `빼앗은 구역도 쿨타임이 ${fmtMs(TAX_COLLECT_COOLDOWN_MIN * 60_000)}로 초기화된다.`,
          '전체 역사는 큰 사건이 없는 날은 기록되지 않는다.',
        ]}
      />
    </>
  );
}
