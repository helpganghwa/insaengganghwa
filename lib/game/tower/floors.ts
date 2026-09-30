/**
 * 무한의 탑 층 데이터 — 몬스터 이름·설명·스킬·장면(docs/TOWER.md §4·§7·§9).
 * 클라이언트에서도 쓰는 순수 모듈(서버 전용 값 없음). 정본 목록은 scripts/tower-art/monsters.json(그림 주문문 포함)이고,
 * 여기엔 화면·전투에 쓰는 이름·설명·스킬만 옮겨 둔다. 그림은 층별 그림이 나오기 전까지 시안용 4종을 돌려 쓴다.
 */
import { josa } from 'josa';

import { TOWER_SKILL, type TowerBattleEvent, type TowerSkill, type TowerTurn } from './battle';

/**
 * 구간마다 1~9층 + 수문장(10번째) — [이름, 설명(생김새), 스킬].
 * 스킬 배치: 1~9층 없음, 11층부터 구간마다 새 스킬 하나를 일반층 몇 마리가 먼저 쓰고 수문장이 같은 스킬로 문을 지킨다.
 * 수문장 스킬은 1개(10·20층) → 4개(100층), 즉사는 100층에만. 요구치는 보정하지 않아 스킬 층이 그만큼 어렵다(TOWER.md §4).
 */
const SECTIONS: { theme: string; mons: [string, string, TowerSkill[]][] }[] = [
  { theme: '잿빛 회랑', mons: [
    ['먼지쥐', '꼬리 끝에 굳은 촛농을 매단 채 돌 틈을 오가는 회색 쥐.', []],
    ['촛불 박쥐', '날개 끝에 작은 불씨를 달고 회랑 천장을 맴도는 박쥐.', []],
    ['촛농 슬라임', '녹은 촛농이 뭉쳐 생긴 말랑한 슬라임, 머리에 심지 하나가 타고 있다.', []],
    ['돌틈 거미', '등껍질이 회랑 돌과 같은 무늬라 가만히 있으면 보이지 않는 거미.', []],
    ['회랑 도마뱀', '벽을 타고 오르내리는 잿빛 도마뱀, 꼬리가 몸보다 길다.', []],
    ['돌비늘 뱀', '비늘이 작은 돌 조각처럼 겹쳐 난 굵은 뱀.', []],
    ['깨진 가고일', '뿔 하나가 부러진 작은 돌 가고일, 날개를 반쯤 편 채 웅크렸다.', []],
    ['촛대 미믹', '낡은 촛대가 네 발로 걸어 다니며, 받침 틈으로 이빨을 드러낸다.', []],
    ['조각난 골렘', '떨어져 나간 벽돌을 이어 붙여 만든 작은 돌 골렘.', []],
    ['돌사자 수호상', '금 간 틈으로 희미한 빛이 새어 나오는 거대한 돌사자.', ['steel']],
  ] },
  { theme: '서리 내린 서고', mons: [
    ['잉크 슬라임', '엎질러진 잉크병에서 흘러나온 검푸른 슬라임, 머리에 깃펜 하나가 꽂혀 있다.', []],
    ['서고 올빼미', '깃털 끝이 하얗게 언 커다란 회색 올빼미.', []],
    ['책 미믹', '표지에 눈이 박힌 두꺼운 책, 덮인 틈으로 이빨과 혀를 내민다.', []],
    ['서리 족제비', '눈 쌓인 서가 위를 달리는 흰 족제비.', []],
    ['서리 여우', '꼬리 끝이 얼어붙은 은회색 여우.', ['freeze']],
    ['얼음 박쥐', '날개막에 성에가 낀 푸른 박쥐.', []],
    ['서리 늑대', '갈기에 고드름이 맺힌 회청색 늑대.', ['freeze']],
    ['책장 미믹', '문을 열면 이빨이 줄지어 드러나는 작은 책장.', []],
    ['얼음 가고일', '온몸에 서리가 앉은 가고일, 날개 끝이 얼음으로 굳었다.', ['freeze']],
    ['서리 드레이크', '등에 얼음 가시가 돋은 날개 없는 용.', ['freeze']],
  ] },
  { theme: '잿불 대장간', mons: [
    ['숯 도롱뇽', '등에서 잿불이 깜빡이는 새까만 도롱뇽.', ['burn']],
    ['불씨 나방', '날개에 식어 가는 불씨 무늬가 있는 나방.', []],
    ['쇳물 슬라임', '식다 만 쇳물로 된 슬라임, 겉은 검고 속은 붉다.', ['burn']],
    ['불똥 참새', '날개를 털 때마다 불똥이 튀는 통통한 잿빛 참새.', []],
    ['녹 사냥개', '녹슨 철판을 덧대어 기운 기계 사냥개.', []],
    ['쇠 전갈', '검붉게 녹슨 쇠 껍질로 덮인 전갈, 집게가 유난히 크다.', []],
    ['모루 거북', '등껍질이 모루인 느린 거북.', ['steel']],
    ['잿불 뱀', '비늘 틈마다 잿불이 남은 검은 뱀.', []],
    ['용광로 황소', '배 속에 잿불이 이글거리는 쇠 황소.', []],
    ['용광로 골렘', '가슴에 용광로를 품은 거대한 쇠 골렘.', ['burn', 'steel']],
  ] },
  { theme: '안개 정원', mons: [
    ['이끼 토끼', '등에 이끼가 소복이 자란 토끼.', []],
    ['가시 고슴도치', '가시 대신 마른 덩굴 가시가 돋은 고슴도치.', []],
    ['버섯 괴물', '넓은 갓 아래 작은 두 발로 걷는 버섯.', ['regen']],
    ['덩굴 뱀', '초록 덩굴이 엉켜 뱀이 되었다, 머리에 흰 꽃 한 송이.', []],
    ['이끼 달팽이', '이끼 덮인 껍데기를 이고 다니는 커다란 달팽이.', []],
    ['식인 꽃', '커다란 꽃잎 속에 이빨이 줄지어 난 꽃.', []],
    ['솔방울 천산갑', '비늘이 커다란 솔방울처럼 겹겹이 덮인 천산갑, 놀라면 공처럼 몸을 만다.', ['steel']],
    ['이끼 곰', '온몸이 두꺼운 이끼로 덮인 곰, 머리에 작은 관을 얹었다.', ['regen']],
    ['덩굴 사슴', '뿔이 마른 덩굴과 흰 꽃으로 된 사슴.', []],
    ['고목 거북', '등에 오래된 나무 한 그루가 자란 거대한 거북.', ['regen', 'steel']],
  ] },
  { theme: '바람 테라스', mons: [
    ['돌풍 제비', '꼬리깃이 칼날처럼 갈라진 잿빛 제비.', ['multi']],
    ['번개 족제비', '털끝에 잔 번개가 튀는 족제비.', ['multi']],
    ['코카트리스', '수탉 머리에 뱀 꼬리를 단 괴물, 볏이 붉다.', []],
    ['폭풍 산양', '크게 말린 뿔에 흰 털이 바람결대로 흩날리는 산양.', []],
    ['돌풍 날다람쥐', '앞뒤 다리 사이 막을 펴고 바람을 타는 잿빛 날다람쥐.', []],
    ['풍향계 골렘', '머리 위에서 녹슨 풍향계가 빙글빙글 도는 작은 쇠 골렘.', []],
    ['번개 여우원숭이', '줄무늬 꼬리 고리마다 잔 번개가 튀는 여우원숭이.', ['multi']],
    ['번개 해태', '소용돌이 갈기에 뿔 하나가 돋은 돌빛 해태, 탑의 문을 지키던 짐승이다.', []],
    ['구름 야크', '등에 작은 먹구름을 이고 다니는 털 긴 야크.', []],
    ['폭풍 천마', '은빛 날개를 활짝 편 천마, 이마에 작은 관이 솟았다.', ['multi', 'freeze']],
  ] },
  { theme: '별 관측소', mons: [
    ['별나방', '짙은 남색 날개에 별점 무늬가 박힌 나방.', []],
    ['황동 부엉이', '렌즈 눈을 단 황동 태엽 부엉이.', ['reflect']],
    ['밤하늘 고양이', '검은 털 속에 작은 별이 반짝이는 고양이.', []],
    ['혜성 여우', '꼬리가 혜성처럼 길게 빛나는 여우.', []],
    ['황동 거미', '관측 기구에서 떨어져 나온 황동 기계 거미.', ['reflect']],
    ['별빛 가오리', '지느러미에 별자리가 새겨진 채 허공을 헤엄치는 가오리.', []],
    ['망원경 미믹', '황동 망원경이 세 발 거치대로 걸어 다니며, 렌즈 속에서 눈이 번뜩인다.', ['steel']],
    ['성좌 늑대', '털에 별자리 선이 흐르는 늑대.', ['multi']],
    ['별빛 그리핀', '깃털 끝에 별가루가 묻은 남색 그리핀.', []],
    ['별빛 키메라', '사자·염소·뱀 머리가 함께 달린 남색 키메라.', ['reflect', 'multi']],
  ] },
  { theme: '바랜 왕궁', mons: [
    ['금박 쥐', '떨어진 금박 조각을 망토처럼 두른 쥐.', []],
    ['찻주전자 미믹', '금테 두른 도자기 찻주전자가 뚜껑을 들썩이며 이빨을 드러낸다.', []],
    ['보물상자 미믹', '금테 두른 상자가 뚜껑을 열자 이빨이 드러난다.', []],
    ['흡혈 박쥐', '붉은 눈의 커다란 왕궁 박쥐.', ['drain']],
    ['보석 새끼용', '제 몸보다 큰 보석을 끌어안고 다니는 작은 새끼 용.', []],
    ['상아 코끼리', '금박 덮개를 두른 상아빛 코끼리, 긴 코를 치켜들고 있다.', ['awe']],
    ['황금 구미호', '금빛 꼬리 아홉 개를 부채처럼 펼친 여우.', []],
    ['황금 표범', '금빛 반점이 박힌 날렵한 표범.', ['multi']],
    ['룩 골렘', '체스판의 성 모양 말이 돌 몸으로 걸어 다닌다.', ['steel']],
    ['옥좌 사자', '등에 부서진 옥좌를 짊어진 거대한 황금 사자.', ['awe', 'drain']],
  ] },
  { theme: '가라앉은 신전', mons: [
    ['산호 게', '등에 바랜 산호가 자란 게.', []],
    ['가시 복어', '잔뜩 부풀어 가시를 세운 복어.', ['reflect']],
    ['항아리 문어', '신전 항아리에 몸을 숨기고 다리만 내민 작은 문어.', []],
    ['심해 앵무조개', '줄무늬 소용돌이 껍데기 밖으로 촉수를 늘어뜨린 앵무조개.', ['seal']],
    ['진주 조개', '입을 벌리면 진주가 빛나는 거대한 조개.', ['steel']],
    ['등불 해룡', '이마 뿔 끝에 작은 등불이 달린 바다 용, 지느러미가 물결처럼 흔들린다.', ['awe']],
    ['신전 우파루파', '산호빛 아가미를 활짝 펼친 통통한 우파루파.', []],
    ['흡혈 오징어', '붉은 망토 같은 막을 두른 심해 오징어.', ['drain']],
    ['신전 해마', '투구 같은 머리를 한 커다란 해마.', []],
    ['심연의 크라켄', '촉수에 신전 기둥 조각을 감은 크라켄.', ['seal', 'drain', 'multi']],
  ] },
  { theme: '멈춘 시계탑', mons: [
    ['태엽 쥐', '등에 작은 태엽 열쇠가 꽂힌 쥐.', []],
    ['모래 도둑 너구리', '모래시계의 모래를 훔쳐 볼주머니에 채운 너구리.', ['drain']],
    ['톱니 아르마딜로', '등딱지가 맞물린 톱니바퀴로 된 아르마딜로.', ['steel']],
    ['시계눈 고양이', '두 눈이 멈춘 시계판인 청동 고양이.', ['stop']],
    ['태엽 곰', '등에 커다란 태엽 열쇠가 꽂힌 청동 곰.', []],
    ['시계추 골렘', '가슴 속 거울 같은 시계추가 흔들리는 청동 골렘.', ['reflect']],
    ['괘종시계 미믹', '문짝이 열리며 이빨이 드러나는 키 큰 괘종시계.', ['stop']],
    ['태엽 전갈', '꼬리 끝이 시곗바늘인 청동 전갈.', ['multi']],
    ['청동 황소', '가슴에 멈춘 시계판을 단 청동 황소.', []],
    ['태엽 용', '등에 거대한 톱니바퀴를 단 청동 용.', ['stop', 'steel', 'reflect']],
  ] },
  { theme: '구름 위 성소', mons: [
    ['구름 양', '털이 뭉게구름인 양.', []],
    ['날개 고양이', '등에 작은 흰 날개가 달린 고양이.', []],
    ['은빛 늑대', '달빛처럼 흰 털의 늑대.', ['awe']],
    ['진주 유니콘', '진주빛 갈기와 옅은 금빛 뿔을 가진 유니콘.', ['rebirth']],
    ['꿈먹는 바쿠', '코끝으로 꿈을 빨아들이는 별무늬 바쿠.', []],
    ['빛의 사슴', '뿔에서 옅은 빛이 흘러내리는 하얀 사슴.', ['regen']],
    ['구름 고래', '구름 사이를 헤엄치는 하얀 고래.', ['steel']],
    ['성소 사자', '날개 달린 하얀 사자.', ['multi']],
    ['성소 기린', '진주빛 비늘과 옅은 금 갈기의 기린.', ['rebirth']],
    ['여섯 날개 백룡', '여섯 날개를 펼친 진주빛 용.', ['death', 'rebirth', 'regen', 'freeze']],
  ] },
];

/** 스킬 표시·설명 — 무대 라벨(이모지+이름)과 설명 팝업. 설명의 수치는 battle.ts TOWER_SKILL에서 읽는다. */
const K = TOWER_SKILL;
export const TOWER_SKILL_INFO: Record<TowerSkill, { icon: string; name: string; desc: string }> = {
  steel: { icon: '🛡', name: '강철 피부', desc: `전투 시작 후 내 공격 ${K.steel.hits}번은 피해가 절반` },
  freeze: { icon: '❄', name: '빙결', desc: `공격이 맞으면 ${K.freeze.bp / 100}% 확률로 나를 ${K.freeze.minTurns}~${K.freeze.maxTurns}턴 얼림(그동안 공격 못 함)` },
  burn: { icon: '🔥', name: '화상', desc: `맞으면 ${K.burn.turns}턴 동안 내 차례마다 체력이 ${K.burn.pct}%씩 탄다` },
  drain: { icon: '🩸', name: '흡혈', desc: `준 피해의 ${K.drain.pct}%만큼 체력을 회복` },
  multi: { icon: '⚡', name: '연속 공격', desc: `공격 뒤 ${K.multi.bp / 100}% 확률로 한 번 더 공격(피해 ×${K.multi.mul})` },
  reflect: { icon: '🪞', name: '반사', desc: `내 급소 피해의 ${K.reflect.pct}%가 나에게 되돌아옴` },
  regen: { icon: '🌿', name: '재생', desc: `차례마다 체력을 ${K.regen.pct}%씩 회복` },
  seal: { icon: '⛓', name: '봉인', desc: '내 급소·공명·반격이 발동하지 않음' },
  stop: { icon: '⏳', name: '시간 정지', desc: `체력 ${K.stop.at}% 아래에서 처음 맞힐 때 한 번, ${K.stop.turns}턴 동안 나만 멈춤` },
  death: { icon: '💀', name: '즉사', desc: `공격할 때 ${K.death.bp / 100}% 확률로 내 체력을 0으로(기사회생으로 버틸 수 있음)` },
  rebirth: { icon: '✨', name: '부활', desc: `쓰러질 때 한 번 체력 ${K.rebirth.pct}%로 다시 일어남` },
  awe: { icon: '👁', name: '위압', desc: `전투 시작 ${K.awe.turns}턴 동안 내 피해 ×${K.awe.mul}` },
};

export type TowerFloorInfo = {
  floor: number;
  name: string;
  /** 구간 이름(장면 제목 줄). */
  theme: string;
  /** 수문장(구간 10번째 층). */
  guardian: boolean;
  /** 몬스터 스킬(0~4개). */
  skills: TowerSkill[];
  /** /sprites/tower/mon/<sprite>.png — 층별 그림(f<층>), 아직 없는 구간은 시안용 4종. */
  sprite: string;
  /** /sprites/tower/scene/<scene>.png — 구간 배경(sec<NN>), 아직 없는 구간은 시안용(수문장 왕좌·구간마다 번갈아). */
  scene: string;
  /** 생김새 한 줄 — 대기 화면 해설. */
  line: string;
};

const PLACEHOLDER = ['wolves', 'skeleton', 'sorcerer'] as const;
/** 층별 그림이 나온 구간(1부터) — /sprites/tower/mon/f<층>.png · /sprites/tower/scene/sec<NN>.png. 없는 구간은 시안용 그림. */
const ART_SECTIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

export function towerFloorInfo(floor: number): TowerFloorInfo {
  const section = Math.min(SECTIONS.length - 1, Math.max(0, Math.floor((floor - 1) / 10)));
  const s = SECTIONS[section]!;
  const [name, desc, skills] = s.mons[(Math.max(1, floor) - 1) % 10]!;
  const guardian = floor % 10 === 0;
  return {
    floor,
    name,
    theme: s.theme,
    guardian,
    skills,
    sprite: ART_SECTIONS.has(section + 1) ? `f${floor}` : guardian ? 'golem' : PLACEHOLDER[floor % PLACEHOLDER.length]!,
    scene: ART_SECTIONS.has(section + 1) ? `sec${String(section + 1).padStart(2, '0')}` : guardian ? 'throne' : section % 2 === 0 ? 'hall' : 'crystal',
    line: desc,
  };
}

/** 층 몬스터 스킬 — 서버 전투 판정용(towerFloorInfo와 같은 표). */
export function towerFloorSkills(floor: number): TowerSkill[] {
  return towerFloorInfo(floor).skills;
}

/** 턴 한 줄 서술 — 재생 중 무대 아래 해설. 몬스터 스킬이 붙은 줄은 스킬 장면을 먼저. 이름 뒤 조사는 josa로. */
export function towerTurnLine(t: TowerTurn, monName: string): string {
  const ev: TowerBattleEvent | null = t.event;
  const sk = new Set(t.skills ?? []);
  if (t.actor === 'me') {
    if (sk.has('freeze') && ev === 'skill') return '몸이 얼어붙어 움직이지 못한다.';
    if (sk.has('stop') && ev === 'skill') return '시간이 멈춰 움직이지 못한다.';
    if (ev === 'miss') return '휘두른 칼끝이 허공을 가른다.';
    if (ev === 'critical') return `${monName}의 빈틈을 정확히 꿰뚫었다.`;
    if (ev === 'resonance') return '아바타와 장비가 함께 울리며 한 번 더 몰아친다.';
    if (ev === 'counter') return '막아 낸 틈을 타 되받아쳤다.';
    if (sk.has('steel')) return '단단한 몸에 막혀 힘이 절반만 들어갔다.';
    if (sk.has('awe')) return josa(`${monName}의 기세에 눌려 힘이 실리지 않는다.`);
    if (ev === 'first_strike') return '먼저 거리를 좁혀 첫 일격을 넣었다.';
    return josa(`${monName}#{을} 몰아붙였다.`);
  }
  if (ev === 'revive') return '쓰러지기 직전, 다시 일어섰다.';
  if (ev === 'skill') {
    if (sk.has('regen')) return `${monName}의 상처가 조금씩 아문다.`;
    if (sk.has('burn')) return '화상으로 몸이 타들어 간다.';
    if (sk.has('reflect')) return '급소를 찌른 충격이 그대로 되돌아왔다.';
    if (sk.has('rebirth')) return josa(`쓰러졌던 ${monName}#{이} 다시 일어섰다.`);
    if (sk.has('death')) return josa(`${monName}의 일격이 숨통을 노린다.`);
    if (sk.has('multi')) return josa(`${monName}#{이} 한 번 더 몰아친다.`);
  }
  if (sk.has('freeze')) return '차가운 일격에 몸이 얼어붙었다.';
  if (sk.has('stop')) return josa(`${monName}#{이} 시간을 멈췄다.`);
  if (sk.has('burn')) return '불붙은 일격에 몸이 타오른다.';
  if (sk.has('drain')) return josa(`${monName}#{이} 피를 빨아 상처를 메운다.`);
  if (ev === 'miss') return `${monName}의 공격이 빗나갔다.`;
  if (ev === 'first_strike') return josa(`${monName}#{이} 먼저 달려든다.`);
  if (ev === 'enrage') return josa(`궁지에 몰린 ${monName}#{이} 광폭해졌다.`);
  return `${monName}의 공격을 받았다.`;
}

/** 전투 기록의 결말 한 줄(B2 — 결과 팝업 대신 기록 끝에 붙는다). 이름 뒤 조사는 josa로. */
export function towerResultLine(win: boolean, monName: string, turns: number): string {
  return win ? josa(`${turns}턴 만에 ${monName}#{이} 쓰러졌다.`) : `${monName}에게 패배했다.`;
}
