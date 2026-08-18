/**
 * 무기 교체 후보 14종 × 남/여 아바타 생성 검증(2026-08-18).
 *
 * 목적: 후보 무기를 실제로 아바타에 들려 봤을 때 재현 품질이 어떤지 눈으로 고르기 위한 것.
 * 그래서 **프로덕션과 같은 경로**로 돌린다 — `composeV3Description`(Claude 비전+로어)과
 * `createCharacterV3`(POST /create-character-v3)를 직접 호출하고, 폴링도 파이프라인과
 * 동일하게 `GET /characters/{id}`의 `rotation_urls.south` 완성 여부로 판정한다.
 *
 * 프로덕션과 다른 점은 딱 둘, 둘 다 의도한 것이다.
 *  ① AI 검수 생략(사용자 지정) — 검수는 뒤쪽 게이트라 생성 구조에는 영향이 없다.
 *  ② 결과를 DB·Storage가 아니라 바탕화면에 저장.
 *
 * ⚠ 카탈로그 등재는 하지 않는다. app/probability/page.tsx가 CATALOG_ITEMS로 확률공시
 *   아이템 목록을 만들어서, 채택 전에 파일로 넣으면 공시가 먼저 바뀐다(게임산업법 §33).
 *   대신 **이 프로세스 안에서만** 배열·매니페스트에 주입한다 — compose 입장에서는 실제
 *   카탈로그 아이템과 완전히 동일하고, 레포에는 아무 흔적도 남지 않는다.
 *
 * 재개형: 이미 저장된 png는 건너뛴다(유료 호출이라 중단 후 재실행이 안전해야 한다).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS, type CatalogItem } from '../lib/game/equipment/catalog';
import { SPRITE_MANIFEST } from '../lib/game/equipment/sprite-manifest';
import { createCharacterV3 } from '../lib/game/profile/pipeline-v3';
import { pixellabKeyByIdx } from '../lib/game/profile/pixellab-keys';
import type { ProfileGender } from '../lib/game/profile/refs';
import { CAND_DATA } from './weapon-cand-data';

const PIX = 'https://api.pixellab.ai/v2';
const KEY_IDX = 1; // key1 고정(후보 스프라이트를 만든 키와 동일).

/**
 * 회차. 무기만 변수로 두려고 방어구·장신구는 회차 안에서 전 종 고정하고,
 * 재검증은 그 두 슬롯을 바꿔 같은 무기를 다시 본다 — 결과가 나빴던 게 무기 탓인지
 * 복장이 밀어낸 탓인지는 옷을 갈아입혀 보기 전에는 갈리지 않는다.
 *
 * ⚠ 두 슬롯 선정 기준(회차 불문): 손을 쓰는 장신구(향로·방패·부채·잔)와 날개류는 배제한다 —
 *   전자는 무기와 손을 다투고, 후자는 우리가 감시하려는 등 날개 아티팩트를 스스로 만들어 낸다.
 */
type Round = {
  dir: string;
  armorKey: string;
  accessoryKey: string;
  /** 지정 시 이 무기만 — 재검증 회차용. */
  only?: string[];
};

const ROUNDS: Record<string, Round> = {
  // 1차: 짙은 남색 교복(컴팩트) + 금테 안경(얼굴).
  '1': {
    dir: '/Users/ryu/Desktop/weapon-avatar-test',
    armorKey: 'academy_student_uniform',
    accessoryKey: 'round_gold_glasses',
  },
  // 2차 재검증: 판금 갑주(짙은 강철·청동, 1차와 톤·실루엣이 완전히 다름) + 안대(얼굴).
  '2': {
    dir: '/Users/ryu/Desktop/weapon-avatar-test-2',
    armorKey: 'kingdom_goldknight_plate',
    accessoryKey: 'general_star_eyepatch',
    only: [
      'angel_lace_parasol',
      'temple_ringstaff_khakkhara',
      'angel_orb_scepter',
      'volcano_flame_blade',
      'swamp_antler_bow',
      'westvolcano_dragonscale_greataxe',
      'plague_doctor_cane',
      'druid_antler_staff',
      'oni_slayer_odachi',
      'druid_thorn_staff',
    ],
  },
  // 3차 재검증: 숲지기 한 벌(중간 톤 녹·갈, 후드 반망토) + 고글(이마).
  // 1차 남색 교복·2차 판금과 톤·실루엣이 또 다르다. 이 회차의 주 변수는 복장이 아니라
  // 정밀화한 wornDesc다 — 4종 모두 "무엇이 안 보였는지"가 지목돼 그 지점만 고쳐 썼다.
  '3': {
    dir: '/Users/ryu/Desktop/weapon-avatar-test-3',
    armorKey: 'forest_ranger_outfit',
    accessoryKey: 'volcano_ashglass_goggles',
    only: [
      'angel_lace_parasol',
      'angel_orb_scepter',
      'westvolcano_dragonscale_greataxe',
      'oni_slayer_odachi',
    ],
  },
  // 4차 재검증: 설산 파수의 갑주(은청 판금) + 사자의 증표(목걸이 메달).
  // 은청 바탕이라 '전체적으로 붉은' 대태도가 튄다. 메달은 목에 걸려 손·머리를 안 쓴다.
  '4': {
    dir: '/Users/ryu/Desktop/weapon-avatar-test-4',
    armorKey: 'temple_frostguard_garb',
    accessoryKey: 'kingdom_coronation_medallion',
    only: ['angel_orb_scepter', 'oni_slayer_odachi'],
  },
  // 5차: 이번에 바꾼 것은 묘사뿐이라(완드 '짧다' 강조, 대태도 부적 제거) 복장은
  // 4차와 같게 둔다 — 옷까지 같이 바꾸면 달라진 결과가 어느 쪽 덕인지 못 가린다.
  '5': {
    dir: '/Users/ryu/Desktop/weapon-avatar-test-5',
    armorKey: 'temple_frostguard_garb',
    accessoryKey: 'kingdom_coronation_medallion',
    only: ['angel_orb_scepter', 'oni_slayer_odachi'],
  },
};

const ROUND = ROUNDS[process.env.ROUND ?? '1'];
if (!ROUND) throw new Error(`알 수 없는 ROUND: ${process.env.ROUND}`);
const { dir: OUT_DIR, armorKey: ARMOR_KEY, accessoryKey: ACCESSORY_KEY } = ROUND;

const CONCURRENCY = 4; // balance.ts PROFILE_GEN_PER_KEY와 동일 — 키 1개 기준 프로덕션 동시성.
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000; // pipeline.ts PROFILE_GEN_TIMEOUT_MIN = 20분과 동일.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 후보를 이 프로세스의 카탈로그에 주입 — compose가 이미지·로어를 실제 아이템처럼 읽게 한다. */
function injectCandidates(): void {
  for (const c of CAND_DATA) {
    const item: CatalogItem = {
      key: c.key,
      slot: 'weapon',
      nameKo: c.nameKo,
      region: c.region as CatalogItem['region'],
      lore: c.lore,
      art: '', // 아이콘 생성용이라 compose 입력에서 제외된다 — 여기서도 불필요.
      wornDesc: c.wornDesc,
    };
    CATALOG_ITEMS.push(item);
    // 스프라이트는 아직 weapon/이 아니라 weapon-cand/에 있다(미채택).
    SPRITE_MANIFEST[c.key] = `/sprites/weapon-cand/${c.key}.png`;
  }
}

interface CharacterDetail {
  id: string;
  rotation_urls?: Record<string, string | null> | null;
}

/** pipeline.ts와 동일 판정 — rotation_urls.south가 채워지면 완료. */
async function waitForSouth(characterId: string, key: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${PIX}/characters/${characterId}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) continue; // 일시 오류는 다음 회차로 — 데드라인이 최종 방어선.
    const j = (await res.json()) as CharacterDetail;
    const south = j.rotation_urls?.south;
    if (typeof south === 'string' && south) return south;
  }
  throw new Error(`폴링 타임아웃(${POLL_TIMEOUT_MS / 60000}분): ${characterId}`);
}

type Task = { cand: (typeof CAND_DATA)[number]; gender: ProfileGender };

async function runOne(t: Task, idx: number, total: number): Promise<'ok' | 'skip'> {
  const g = t.gender === 'male' ? 'm' : 'f';
  const out = join(OUT_DIR, `${t.cand.key}_${g}.png`);
  const tag = `[${String(idx).padStart(2, '0')}/${total}] ${t.cand.nameKo}(${g})`;
  if (existsSync(out)) {
    console.log(`  · ${tag} (이미 있음)`);
    return 'skip';
  }

  const created = await createCharacterV3({
    gender: t.gender,
    weaponKey: t.cand.key,
    armorKey: ARMOR_KEY,
    accessoryKey: ACCESSORY_KEY,
    keyIdx: KEY_IDX,
  });

  // 어떤 프롬프트로 나온 그림인지 함께 남긴다 — 품질이 나쁠 때 무기 묘사가 죽었는지
  // 포즈·의상이 밀어냈는지를 이미지만 보고는 가릴 수 없다.
  writeFileSync(
    join(OUT_DIR, `${t.cand.key}_${g}.txt`),
    [
      `key        ${t.cand.key}`,
      `nameKo     ${t.cand.nameKo}`,
      `gender     ${t.gender}`,
      `character  ${created.characterId}`,
      `appearance ${JSON.stringify(created.appearance)}`,
      '',
      created.description,
      '',
    ].join('\n'),
  );

  const url = await waitForSouth(created.characterId, pixellabKeyByIdx(KEY_IDX));
  const img = await fetch(url);
  if (!img.ok) throw new Error(`이미지 다운로드 실패 HTTP ${img.status}`);
  writeFileSync(out, Buffer.from(await img.arrayBuffer()));
  console.log(`  ✓ ${tag}`);
  return 'ok';
}

async function main(): Promise<void> {
  injectCandidates();
  mkdirSync(OUT_DIR, { recursive: true });

  const targets = ROUND.only
    ? ROUND.only.map((k) => {
        const c = CAND_DATA.find((x) => x.key === k);
        if (!c) throw new Error(`only에 없는 키: ${k}`); // 오타가 조용히 누락되면 안 된다.
        return c;
      })
    : CAND_DATA;

  const tasks: Task[] = targets.flatMap((cand) => [
    { cand, gender: 'female' as ProfileGender },
    { cand, gender: 'male' as ProfileGender },
  ]);

  console.log(`무기 ${targets.length}종 × 남녀 = ${tasks.length}건 · 동시 ${CONCURRENCY} · key${KEY_IDX}`);
  console.log(`방어구 ${ARMOR_KEY} · 장신구 ${ACCESSORY_KEY} 고정 · AI 검수 생략`);
  console.log(`→ ${OUT_DIR}\n`);

  let done = 0;
  let skipped = 0;
  const failed: string[] = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        const r = await runOne(tasks[i], i + 1, tasks.length);
        if (r === 'ok') done += 1;
        else skipped += 1;
      } catch (e) {
        const t = tasks[i];
        const label = `${t.cand.key}_${t.gender === 'male' ? 'm' : 'f'}`;
        failed.push(label);
        console.error(`  ✗ ${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\n완료 — 생성 ${done} · 스킵 ${skipped} · 실패 ${failed.length}`);
  if (failed.length) console.log(`실패 목록: ${failed.join(', ')}`);
}

await main();
