import { describe, expect, it } from 'vitest';

import {
  applyBattleToHistory,
  emptyHistory,
  generateHeadlines,
  josa,
  pickHeadlines,
  type Headline,
  type HeadlineBattle,
  type HeadlineParticipant,
} from '@/lib/game/melee/headlines';

/** 참가자 픽스처 — rank 순서대로 cp 내림차순 기본, 필요한 필드만 덮어쓴다. */
function part(i: number, o: Partial<HeadlineParticipant> = {}): HeadlineParticipant {
  return {
    userId: `u${i}`,
    nickname: `유저${i}`,
    cp: 100_000 - i * 1_000,
    rank: i,
    killerUserId: i === 1 ? null : `u${Math.max(1, i - 1)}`,
    attackCount: 5,
    defenseCount: 5,
    eliminatedRound: 100 - i,
    guildName: null,
    ...o,
  };
}
function battle(parts: HeadlineParticipant[], date = '2026-09-03', finaleEvents: HeadlineBattle['finale']['events'] = []): HeadlineBattle {
  const champ = parts.find((p) => p.rank === 1)!;
  return {
    date,
    participantCount: parts.length,
    totalRounds: 100,
    championUserId: champ.userId,
    finale: { roster: parts.slice(0, 3).map((p) => ({ userId: p.userId, nickname: p.nickname, cp: p.cp, rank: p.rank })), events: finaleEvents },
  };
}
const codes = (c: Headline[]) => c.map((x) => x.code);

describe('melee headlines — 조사', () => {
  it('받침에 맞춰 이/가·을/를·과/와를 고르고, 로마자·판정 불가는 병기한다', () => {
    expect(josa('슷파', '이', '가')).toBe('슷파가');
    expect(josa('무인', '이', '가')).toBe('무인이');
    expect(josa('Res', '을', '를')).toBe('Res를');
    expect(josa('Aiden', '을', '를')).toBe('Aiden을');
    expect(josa('지인', '과', '와')).toBe('지인과');
    expect(josa('☆', '이', '가')).toBe('☆이(가)');
  });
});

describe('melee headlines — 탐지', () => {
  it('첫 배틀: 데뷔 우승·데뷔 시상대·오늘 최다 처치가 잡히고, 이력 기반(역대·연속)은 나오지 않는다', () => {
    const parts = Array.from({ length: 30 }, (_, i) => part(i + 1));
    // u1이 5명 처치
    for (const i of [2, 3, 4, 5, 6]) parts[i - 1]!.killerUserId = 'u1';
    const { candidates, picks } = generateHeadlines(battle(parts), parts, emptyHistory());
    expect(codes(candidates)).toContain('debut_win');
    expect(codes(candidates)).toContain('debut_podium');
    expect(codes(candidates)).toContain('slayer_champ');
    expect(codes(candidates)).not.toContain('record_attacks');
    expect(codes(candidates)).not.toContain('win_streak');
    expect(picks.length).toBeGreaterThanOrEqual(1);
    expect(picks.length).toBeLessThanOrEqual(4);
    // 같은 주인공(u1)이 두 줄에 나오지 않는다
    const subj = picks.flatMap((p) => p.subjects);
    expect(new Set(subj).size).toBe(subj.length);
  });

  it('이력: 연속 우승·통산·리매치·복수·천적·순위 급등이 어제 스냅샷과 누적에서 나온다', () => {
    const h = emptyHistory();
    // 4일치 이력: 매일 u1 우승, u2 2위, u3이 u9를 처치, u9는 매일 u3에게 탈락
    const N = 150; // rank_jump는 100계단 이상 상승이 조건이라 참가자를 넉넉히
    let parts = Array.from({ length: N }, (_, i) => part(i + 1));
    for (const d of ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']) {
      parts = parts.map((p) => ({ ...p }));
      parts[8]!.killerUserId = 'u3'; // u9 ← u3
      const b = battle(parts, d);
      const r = generateHeadlines(b, parts, h);
      applyBattleToHistory(h, b, parts, r.picks);
    }
    expect(h.battlesBefore).toBe(4);
    expect(h.stats.get('u1')?.wins).toBe(4);
    expect(h.stats.get('u1')?.winStreak).toBe(4);
    expect(h.stats.get('u2')?.seconds).toBe(4);

    // 오늘: u1 또 우승·u2 또 2위(리매치 + 5일 연속), u9가 u3을 되갚음, 어제 150위 u150이 오늘 5위로 급등
    const today = Array.from({ length: N }, (_, i) => part(i + 1));
    today[2]!.killerUserId = 'u9'; // u3 ← u9 (복수)
    today[4] = part(5, { userId: 'u150', nickname: '유저150', cp: 100 });
    today[N - 1] = part(N, { userId: 'u5', nickname: '유저5' });
    const { candidates, picks } = generateHeadlines(battle(today), today, h);
    const c = codes(candidates);
    expect(c).toContain('win_streak');
    expect(c).toContain('rematch');
    expect(c).toContain('revenge');
    expect(c).toContain('eternal_second');
    expect(c).toContain('rank_jump');
    expect(candidates.find((x) => x.code === 'win_streak')?.text).toContain('5일 연속');
    expect(candidates.find((x) => x.code === 'eternal_second')?.text).toContain('5번째 준우승');
    // 픽은 서로 다른 분류·서로 다른 주인공
    expect(new Set(picks.map((p) => p.category)).size).toBe(picks.length);
    // 줄표·이모지 없음(우편 규칙)
    for (const p of picks) {
      expect(p.text).not.toMatch(/[—]/);
      expect(p.text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it('역대 기록은 이력 3배틀 이후에만 잡히고, 갱신 시에만 나온다', () => {
    const h = emptyHistory();
    let parts = Array.from({ length: 20 }, (_, i) => part(i + 1, { attackCount: 5 }));
    for (const d of ['2026-08-30', '2026-08-31', '2026-09-01']) {
      const b = battle(parts, d);
      applyBattleToHistory(h, b, parts, []);
    }
    expect(h.records.maxAttacks).toBe(5);
    parts = parts.map((p) => ({ ...p }));
    parts[0]!.attackCount = 30;
    const r = generateHeadlines(battle(parts), parts, h);
    const rec = r.candidates.find((x) => x.code === 'record_attacks');
    expect(rec?.text).toBe('유저1, 공격 30회로 역사상 최다 공격');
    // 같은 값이면 갱신이 아니다
    applyBattleToHistory(h, battle(parts), parts, r.picks);
    const r2 = generateHeadlines(battle(parts, '2026-09-04'), parts, h);
    expect(codes(r2.candidates)).not.toContain('record_attacks');
  });

  it('자이언트 킬링은 쓰러진 쪽 전투력이 중앙값 이상일 때만, 결승 접전은 잔여 체력 5% 이하일 때만', () => {
    const parts = Array.from({ length: 30 }, (_, i) => part(i + 1));
    // u30(cp 71,000)이 u2(cp 98,000)를 쓰러뜨림 → 비율 1.38 < 3 → 미해당
    parts[1]!.killerUserId = 'u30';
    let r = generateHeadlines(battle(parts), parts, emptyHistory());
    expect(codes(r.candidates)).not.toContain('giant_kill');
    // u30 전투력 1,000 → 비율 98 → 해당
    parts[29]!.cp = 1_000;
    r = generateHeadlines(battle(parts), parts, emptyHistory());
    expect(r.candidates.find((x) => x.code === 'giant_kill')?.text).toBe('전투력 1,000의 유저30이 전투력 98,000의 유저2를 쓰러뜨림');
    // 결승 접전: 로스터 idx0=u1(rank1, cp 99,000 → maxHp 198,000), 마지막 피격 잔여 5,000(2.5%)
    const ev: HeadlineBattle['finale']['events'] = [[1, 0, 100_000, 5_000], [0, 1, 200_000, 0]];
    r = generateHeadlines(battle(parts, '2026-09-03', ev), parts, emptyHistory());
    expect(r.candidates.find((x) => x.code === 'final_clutch')?.text).toBe('유저1, 체력 2.5%를 남기고 우승');
  });
});

describe('melee headlines — 자동 선택', () => {
  const mk = (code: string, category: Headline['category'], score: number, subjects: string[]): Headline => ({ code, category, score, text: code, subjects });
  it('점수순·주인공 중복 금지·분류 중복 금지·어제 코드 감점, 3개 기본·희귀는 4개', () => {
    const h = emptyHistory();
    h.usedYesterdayCodes = new Set(['a']);
    const cands = [
      mk('a', 'crown', 3.4, ['x']), // 어제 쓴 코드 −0.7 → 2.7, 분류(crown)는 b가 먼저 차지 → 탈락
      mk('b', 'crown', 3, ['y']),
      mk('c', 'upset', 2.5, ['y']), // 주인공 y가 b와 중복 → 탈락
      mk('d', 'drama', 2, ['z']),
      mk('e', 'record', 3.2, ['w']),
      mk('f', 'growth', 1, ['v']),
    ];
    const picks = pickHeadlines(cands, h);
    // 정렬: e 3.2 · b 3.0 · a 2.7 · c 2.5 · d 2.0 · f 1.0 → e, b, (a 분류 중복) (c 주인공 중복) d → 3개에서 정지(4번째는 3점 이상만)
    expect(picks.map((p) => p.code)).toEqual(['e', 'b', 'd']);
  });
  it('4번째 줄은 감점 후 점수가 3 이상일 때만 붙는다', () => {
    const h = emptyHistory();
    const picks = pickHeadlines([mk('a', 'crown', 3.4, ['x']), mk('b', 'upset', 3, ['y']), mk('c', 'drama', 2.9, ['z']), mk('d', 'record', 2.9, ['w'])], h);
    expect(picks.map((p) => p.code)).toEqual(['a', 'b', 'c']);
    const picks2 = pickHeadlines([mk('a', 'crown', 3.4, ['x']), mk('b', 'upset', 3, ['y']), mk('c', 'drama', 3, ['z']), mk('d', 'record', 3, ['w'])], h);
    expect(picks2.map((p) => p.code)).toEqual(['a', 'b', 'c', 'd']);
  });
});
