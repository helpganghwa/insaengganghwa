import { describe, expect, it } from 'vitest';

import { characterIdFromSpriteUrl } from '@/lib/game/profile/return';

describe('characterIdFromSpriteUrl — 반환 요청 ↔ 생성 잡 매칭 키', () => {
  it('공개 URL·상대 경로·쿼리 포함 모두 파일명 앞 세그먼트를 돌려준다', () => {
    expect(characterIdFromSpriteUrl('https://x.supabase.co/storage/v1/object/public/avatars/u1/9ba53745-abcd/south.png')).toBe('9ba53745-abcd');
    expect(characterIdFromSpriteUrl('u1/char-2/south.png?v=3')).toBe('char-2');
    expect(characterIdFromSpriteUrl('south.png')).toBeNull();
    expect(characterIdFromSpriteUrl(null)).toBeNull();
  });
});
