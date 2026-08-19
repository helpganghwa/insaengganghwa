import {
  CONQUEST_BATTLE_KST_HOUR,
  CONQUEST_DMG_MAX,
  CONQUEST_DMG_MIN,
  CONQUEST_HP_MULT,
  GUILD_EXECUTOR_TAX_CUT,
  GUILD_FULL_REGION_TAX_BONUS,
  GUILD_ZONE_TAX_BONUS,
  RESIDENCE_MOVE_COOLDOWN_MIN,
  RESIDENCE_SPEEDUP_GEM_PER_MIN,
  TAX_COLLECT_COOLDOWN_MIN,
  TAX_POINTS_PER_DIAMOND,
  conquestPowerMult,
} from '@/lib/game/guild/balance';
import { REGION_META } from '@/lib/game/guild/region-meta';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt, fmtMs } from '../fmt';
import { DocLink, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'conquest',
  cat: '길드',
  title: '점령전',
  summary: '하루 한 번 벌어지는 구역 다툼과 집행관, 세금, 방치로 잃는 땅.',
  sections: [
    { id: 'day', label: '하루 흐름' },
    { id: 'residence', label: '거주 구역' },
    { id: 'deploy', label: '배치' },
    { id: 'battle', label: '전투 판정' },
    { id: 'executor', label: '집행관' },
    { id: 'tax', label: '세금과 분배' },
    { id: 'abandon', label: '방치한 구역' },
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
      <H2 id="day">하루 흐름</H2>
      <P>
        점령전은 하루 한 번, {fmtInt(CONQUEST_BATTLE_KST_HOUR)}시에 치러진다. 그 시각의 배치를 그대로
        굳혀 전투를 계산하지만 결과는 감춰둔 채 저장만 하고, 자정이 되어서야 소유권이 실제로 넘어간다.
        결과 우편과 연대기도 이때 함께 열린다.
      </P>
      <P>
        {fmtInt(CONQUEST_BATTLE_KST_HOUR)}시부터 {fmtInt(UNLOCK_HOUR)}시까지는 배치와 배치 해제, 집행관
        지정, 거주 이동이 모두 막힌다. 계산이 도는 중에 입력이 바뀌거나 소유권이 뒤집히는 것을 막기
        위해서다. 배치는 언제 넣든 아직 치르지 않은 다음 점령전에 붙으므로, 잠금이 풀린 뒤에 넣으면 그날
        밤 전투에 선다.
      </P>

      <H2 id="residence">거주 구역</H2>
      <P>
        구역에 배치하거나 집행관을 맡으려면 그 구역에 살아야 한다. 거주 구역은 강화에 처음 성공할 때
        무작위로 정해지고, 그다음부터는 세계 지도에서 직접 옮긴다. 처음 정착하는 한 번은 인접 제한도
        대기도 걸리지 않는다.
      </P>
      <P>
        이동은 맞닿은 구역으로만 된다. 한 번 옮기면 {fmtMs(RESIDENCE_MOVE_COOLDOWN_MIN * 60_000)} 동안
        다시 움직이지 못하고, 남은 시간은 분당 {fmtInt(RESIDENCE_SPEEDUP_GEM_PER_MIN)}다이아를 내고
        지운다. 강화 세금도 거주 구역에 쌓이므로 사는 곳을 옮기면 세금이 들어가는 곳도 바뀐다.
      </P>
      <Warn>
        배치나 집행관 자리를 가진 채 거주를 옮기면 그 역할이 풀린다. 홈 구역에 다른 수비를 남기지 않고
        떠나면 그날 방치로 판정돼 구역을 통째로 잃을 수 있다.
      </Warn>

      <H2 id="deploy">배치</H2>
      <P>
        한 사람이 하루에 설 수 있는 자리는 하나다. 구역 하나를 골라 공격이나 수비 중 하나로 서고, 나중에
        다른 곳에 서면 앞의 배치는 지워진다. 배치를 넣는 것은 본인만 할 수 있다.
      </P>
      <UL>
        <LI>수비는 자기 길드가 이미 가진 구역에만 선다.</LI>
        <LI>공격은 자기 길드 것이 아닌 구역에 서되, 자기 길드 구역과 맞닿아 있어야 한다.</LI>
        <LI>가진 구역이 하나도 없는 길드는 어디든 첫 상륙이 가능하다.</LI>
        <LI>주인 없는 중립 구역은 맞닿아 있지 않아도 공격할 수 있다.</LI>
      </UL>
      <P>
        집행관이 어딘가에 배치하면 집행관 자리는 자동으로 빈다. 한 사람이 자동 수비와 배치를 겹쳐 들 수
        없기 때문이다. 남의 배치를 물리는 것은 별도 권한이며{' '}
        <DocLink slug="guild-roles">길드 권한</DocLink>에서 다룬다.
      </P>

      <H2 id="battle">전투 판정</H2>
      <P>
        전투는 공격 배치가 하나라도 들어온 구역에서만 벌어진다. 아무도 노리지 않은 구역은 계산 자체를
        하지 않고 주인이 그대로 간다. 참가자는 그 구역의 공격·수비 배치와 집행관이다.
      </P>
      <P>
        각자의 장비 전투력에 역할 배수를 곱한 값이 유효 전투력이 되고, 체력과 피해가 모두 이 값에서
        나온다. 수비 쪽이 조금 유리하고 집행관이 가장 세다.
      </P>
      <Tbl head={['역할', '유효 전투력']} rows={POWER_ROWS} />
      <P>
        체력은 유효 전투력의 {fmtInt(CONQUEST_HP_MULT)}배다. 한 대에 들어가는 피해는 때리는 쪽 유효
        전투력의 {bpPct(CONQUEST_DMG_MIN * 10_000)}에서 {bpPct(CONQUEST_DMG_MAX * 10_000)} 사이에서
        정해진다. 같은 길드끼리는 겨루지 않고, 한 길드만 남는 순간 그 길드가 이긴다.
      </P>
      <P>
        이긴 길드가 원래 주인과 다르면 자정에 구역이 넘어간다. 끝까지 승자가 갈리지 않으면 주인은 그대로
        간다. 공개가 끝나면 지켜낸 구역의 수비 배치는 다음 날로 이어지고, 공격 배치는 남지 않는다.
      </P>

      <H2 id="executor">집행관</H2>
      <P>
        구역마다 한 명을 세운다. 집행관 지정 권한을 가진 사람이 그 구역에 사는 길드원 중에서 고르고, 한
        사람이 두 구역을 동시에 맡지는 못한다. 새로 점령한 구역은 집행관이 빈 채로 시작한다.
      </P>
      <P>
        집행관은 배치하지 않아도 그 구역 수비로 자동 참전하고, 유효 전투력이{' '}
        {bpPct(conquestPowerMult('defend', true) * 10_000)}로 잡힌다. 세금을 걷는 권한도 여기 붙는다.
        구역을 지키는 축이자 돈이 나오는 자리라, 자리를 비우면 두 가지가 한꺼번에 멈춘다.
      </P>
      <P>
        교체되거나 해제된 집행관은 그 구역의 평범한 수비 배치로 돌아간다. 길드를 나가거나 추방당하면
        집행관 자리는 곧바로 비고, 걷지 않은 세금은 구역에 그대로 남는다.
      </P>

      <H2 id="tax">세금과 분배</H2>
      <P>
        자기 거주 구역에서 강화에 성공할 때마다 도달한 강화 레벨만큼 포인트가 그 구역에 쌓인다.{' '}
        {fmtInt(TAX_POINTS_PER_DIAMOND)}포인트가 모일 때마다 다이아 하나가 되고, 남는 포인트는 다음으로
        넘어간다.
      </P>
      <P>
        많이 가진 길드일수록 더 걷는다. 소유 구역 하나당{' '}
        {bpPct(GUILD_ZONE_TAX_BONUS * 10_000)}, 대륙 {fmtInt(REGION_COUNT)}개 지역 중 하나를 통째로
        가지면 그 지역마다 {bpPct(GUILD_FULL_REGION_TAX_BONUS * 10_000)}가 더 붙고, 이 배율이 그 길드의
        모든 구역 누적에 곱해진다. 배율은 소유가 바뀔 때 다시 계산된다.
      </P>
      <P>
        수금은 집행관이 한다. 구역을 손에 넣고 {fmtMs(TAX_COLLECT_COOLDOWN_MIN * 60_000)}이 지나야 첫
        수금이 열리고, 그 뒤로도 {fmtMs(TAX_COLLECT_COOLDOWN_MIN * 60_000)}에 한 번이다. 빼앗은 구역도
        같은 시계를 처음부터 다시 센다.
      </P>
      <P>
        걷은 다이아 중 {bpPct(GUILD_EXECUTOR_TAX_CUT * 10_000)}는 집행관 몫으로 바로 들어가고, 나머지{' '}
        {bpPct((1 - GUILD_EXECUTOR_TAX_CUT) * 10_000)}는 길드 세금 풀에 모인다. 풀은 세금 분배 권한자가
        연다. 전원 균등, 한 사람 몰아주기, 사람별 금액 지정 셋 중 하나로 나누며 지급은 보상 우편으로
        간다.
      </P>

      <H2 id="abandon">방치한 구역</H2>
      <P>
        그날 전투에 공격도 수비도 한 명 없고 집행관 자리까지 비어 있으면, 그 구역은 방치로 본다. 남이
        노리지 않았더라도 결과는 같다.
      </P>
      <Warn>
        방치된 구역은 자정 공개 직후 중립으로 풀린다. 싸움 한 번 없이 잃는 것이고, 되찾으려면 다시
        공격해야 한다. 쌓여 있던 세금은 구역에 남아 다음 주인이 걷는다.
      </Warn>
      <P>
        중립이 된 구역은 인접 조건 없이 누구나 노릴 수 있어, 오래 방치된 땅일수록 빨리 임자가 바뀐다.
        다만 그 전투일이 시작된 뒤에 점령한 구역은 방치로 치지 않는다. 배치할 기회 자체가 없었기
        때문이다.
      </P>
      <P>길드가 해산할 때도 보유 구역은 같은 방식으로 중립이 된다.</P>

      <H2 id="chronicle">연대기</H2>
      <P>
        하루치 점령전은 자정에 한 편의 이야기로 묶여 세계 지도 아래에 열린다. 어느 길드가 어디를 노렸고
        누가 막아냈는지, 판이 어떻게 움직였는지가 그날 기록으로 남는다.
      </P>
      <P>
        점령도 방치 상실도 해산도 눈에 띄는 활약도 없는 날은 아예 기록하지 않는다. 판이 크게 바뀐 날에만
        한 줄 제목이 붙고, 그런 날짜만 연표에 쌓인다. 구역별 전투 기록은 자정 공개 전에는 열리지 않는다.
      </P>

      <Note>
        길드를 만들고 사람을 채우는 쪽은 <DocLink slug="guild">길드 기본</DocLink>, 배치 해제와 집행관
        지정을 누가 쥐는지는 <DocLink slug="guild-roles">길드 권한</DocLink>, 유효 전투력의 바탕이 되는
        총 전투력은 <DocLink slug="combat-power">전투력</DocLink>에 있다.
      </Note>
    </>
  );
}
