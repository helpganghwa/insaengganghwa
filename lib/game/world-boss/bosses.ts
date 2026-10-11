/**
 * 월드보스 종류 레지스트리 — 순수 모듈(서버·클라이언트가 같이 쓴다).
 *
 * 다른 컨셉의 보스가 더해진다는 전제(10-11 사용자)로 이름·그림·이야기 문장을 **종류 코드**(world_bosses.boss_code, 0235)로 찾는다.
 * 출현 구역의 지역(region)은 지역색·구역 꾸밈에만 쓰고 보스 종류와는 무관하다 — 어느 땅에 나타나도 같은 종류면 같은 보스.
 *
 * 종류를 더하는 절차: ① 그림 5종(정지 256px·대기 띠 9프레임·불씨 띠·배경 400×240·배경 빛 — 전부 무손실 webp) ② 아래 표에 항목 추가(이름·경로·문장 풀·사라짐 표현)
 * ③ 어드민 소환 화면의 종류 선택지는 WORLD_BOSS_KIND_OPTIONS가 자동으로 늘린다 ④ 칭호는 공통 칭호 + 종류별 '첫 ○○ 토벌'(docs/WORLD-BOSS.md).
 * 이름·문장 모음은 💎📦 외 이모지·줄표를 쓰지 않는다(10-11 사용자). josa 표기(#{을} 등)는 호출부가 josa()로 풀어 쓴다.
 */

export type WorldBossKindCode = 'ember_phoenix';

export type WorldBossKind = {
  code: WorldBossKindCode;
  name: string;
  /** 정지 그림(256px 정면). */
  sprite: string;
  /** 대기 애니 띠(9프레임, 0번 = 정지 그림)와 같은 박자의 빛 띠. */
  anim: string;
  ember: string;
  /** 무대 배경(400×240)과 배경에서 뽑은 빛. */
  bg: string;
  bgEmber: string;
  /** 이야기 문장 — 재생 일지·월드 로그·우편·푸시. */
  lines: {
    /** 대원의 공격(무기 이름이 기록된 전투). */
    attack: ((nick: string, weapon: string) => string)[];
    /** 무기 이름이 없는 옛 기록용. */
    bareAttack: ((nick: string) => string)[];
    /** 보스의 반격으로 대원이 쓰러지는 줄. */
    strike: ((boss: string, nick: string) => string)[];
    /** 보스가 사라지는 표현 — 이어지는 말·과거(해요체)·과거(합쇼체). '떠나다'는 쓰지 않는다(§1 용어). */
    leave: { linking: string; pastPolite: string; pastFormal: string };
  };
};

const EMBER_PHOENIX: WorldBossKind = {
  code: 'ember_phoenix',
  name: '잿불의 불사조',
  sprite: '/sprites/world-boss/boss.webp', // 무손실 webp(10-11: png 58KB → 19KB)
  anim: '/sprites/world-boss/boss__anim.webp',
  ember: '/sprites/world-boss/boss__ember.webp',
  bg: '/sprites/world-boss/bg.webp', // 무손실 webp(72KB → 26KB)
  bgEmber: '/sprites/world-boss/bg__ember.webp',
  lines: {
    attack: [
      (n, w) => `${n}, ${w}#{을} 휘두른다`,
      (n, w) => `${n}#{이} ${w}#{을} 번뜩이며 파고든다`,
      (n, w) => `${n}, 틈을 노려 ${w}#{을} 찔러 넣는다`,
      (n, w) => `${n}의 ${w}#{이} 깃털을 가르며 꽂힌다`,
      (n, w) => `${n}, 잿불을 뚫고 ${w}#{을} 내리꽂는다`,
      (n, w) => `${n}#{이} ${w}#{을} 크게 휘둘러 후려친다`,
      (n, w) => `${n}, ${w}#{을} 움켜쥐고 몸통을 노린다`,
      (n, w) => `${n}#{이} 날개 사이로 ${w}#{을} 꽂아 넣는다`,
    ],
    bareAttack: [(n) => `${n}#{이} 일격을 날린다`, (n) => `${n}#{이} 몸통을 노려 내리친다`, (n) => `${n}, 틈을 노려 파고든다`, (n) => `${n}#{이} 잿불을 뚫고 달려든다`],
    strike: [
      (_, n) => `날갯짓에 잿불이 ${n}#{을} 덮쳤다. 쓰러짐`, // 보스 이름을 매 줄 반복하지 않는다(10-11 재검사)
      (b, n) => `${b}#{이} 울부짖으며 불덩이를 토해 냈다. ${n} 쓰러짐`,
      (_, n) => `${n}#{이} 잿불 폭풍에 휩쓸려 쓰러졌다`,
      (b, n) => `${b}의 발톱이 ${n}#{을} 낚아챘다. 쓰러짐`,
      (_, n) => `잿더미가 솟구쳐 ${n}#{을} 삼켰다. 쓰러짐`,
      (_, n) => `꼬리 깃이 불꽃을 흩뿌려 ${n}#{이} 쓰러졌다`,
      (b, n) => `${n}, ${b}의 눈빛에 묶인 채 잿불에 휘감겨 쓰러졌다`,
      (_, n) => `불타는 깃털 소나기에 ${n}#{이} 버티지 못하고 쓰러졌다`,
    ],
    leave: { linking: '재로 흩어지며', pastPolite: '재로 흩어졌어요', pastFormal: '재로 흩어졌습니다' },
  },
};

export const WORLD_BOSS_KINDS: Record<WorldBossKindCode, WorldBossKind> = { ember_phoenix: EMBER_PHOENIX };
export const DEFAULT_WORLD_BOSS_KIND: WorldBossKindCode = 'ember_phoenix';
/** 어드민 소환 선택지. */
export const WORLD_BOSS_KIND_OPTIONS: { code: WorldBossKindCode; name: string }[] = Object.values(WORLD_BOSS_KINDS).map((k) => ({ code: k.code, name: k.name }));

export function isWorldBossKindCode(v: unknown): v is WorldBossKindCode {
  return typeof v === 'string' && v in WORLD_BOSS_KINDS;
}

/** 종류 코드 → 정의. 모르는 코드(옛 데이터·오타)는 기본 종류로 — 화면이 비는 것보다 낫다. */
export function worldBossKind(code?: string | null): WorldBossKind {
  return isWorldBossKindCode(code) ? WORLD_BOSS_KINDS[code] : WORLD_BOSS_KINDS[DEFAULT_WORLD_BOSS_KIND];
}

export function worldBossName(code?: string | null): string {
  return worldBossKind(code).name;
}
export function worldBossSpriteUrl(code?: string | null): string {
  return worldBossKind(code).sprite;
}
export function worldBossBgUrl(code?: string | null): string {
  return worldBossKind(code).bg;
}
export function worldBossAnimUrl(code?: string | null): string {
  return worldBossKind(code).anim;
}
export function worldBossEmberUrl(code?: string | null): string {
  return worldBossKind(code).ember;
}
export function worldBossBgEmberUrl(code?: string | null): string {
  return worldBossKind(code).bgEmber;
}
