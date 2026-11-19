import { describe, expect, it } from 'vitest';

import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { eyeColorsOf, hairColorOf, summarizeAvatarJobs } from '@/lib/game/today/avatar-stats';

const [i1, i2, i3] = CATALOG_ITEMS;

describe('아바타 카드 집계(#618)', () => {
  it('오드아이는 두 색을 모두 세고, 풀에 없는 색은 버린다', () => {
    expect(eyeColorsOf('amber-and-teal heterochromatic (one eye each color)')).toEqual(['amber', 'teal']);
    expect(eyeColorsOf('crimson')).toEqual(['crimson']);
    expect(eyeColorsOf('rainbow')).toEqual([]);
    expect(eyeColorsOf(null)).toEqual([]);
  });

  it('머리색은 첫 토막(하이픈 색 포함)', () => {
    expect(hairColorOf('platinum-blonde long wavy')).toBe('platinum-blonde');
    expect(hairColorOf('pink twin-tails')).toBe('pink');
    expect(hairColorOf('weird short')).toBeNull();
  });

  it('성별·많이 나온 외형·장비·지역을 센다', () => {
    const s = summarizeAvatarJobs([
      { gender: 'female', eye: 'crimson', hair: 'pink long wavy', keys: [i1!.key, i2!.key, i3!.key] },
      { gender: 'female', eye: 'crimson-and-teal heterochromatic (one eye each color)', hair: 'silver a hime-cut', keys: [i1!.key, null, 'gone_item'] },
      { gender: 'male', eye: 'teal', hair: 'silver short tousled', keys: [i1!.key, i2!.key, null] },
    ]);
    expect(s.female).toBe(2);
    expect(s.male).toBe(1);
    expect(s.topEye).toEqual({ label: '진홍', n: 2 }); // 진홍 2·청록 2 동률 → 먼저 나온 진홍
    expect(s.topHair).toEqual({ label: '은발', n: 2 });
    expect(s.topItem).toEqual({ name: i1!.nameKo, n: 3 });
    expect(s.kinds).toBe(3); // 카탈로그에 없는 키는 빼고
    expect(s.regions.reduce((t, r) => t + r.n, 0)).toBe(6);
  });

  it('빈 기록은 모두 비어 있다', () => {
    expect(summarizeAvatarJobs([])).toEqual({ female: 0, male: 0, topEye: null, topHair: null, regions: [], topItem: null, kinds: 0 });
  });
});
