import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { chatMiniTopic, chatTopic, whisperTopic } from '@/lib/game/chat/realtime';

/**
 * 채팅 실시간 토픽(2026-09-21) — 토픽에는 서버만 계산할 수 있는 HMAC이 붙는다. 클라가 이름을 직접
 * 조립하면 아무것도 받지 못한다: 월드 토픽에 HMAC을 붙이면서 미니바 구독만 바꾸고 패널 열림 중의 월드
 * 구독(`chat:s${sid}`)을 놓쳐, 열어 둔 동안 월드 채팅이 폴링으로만 들어온 적이 있다.
 */
const DOCK = readFileSync(new URL('../../components/chat/ChatDock.tsx', import.meta.url), 'utf8');
const RECENT = readFileSync(new URL('../../app/api/chat/recent/route.ts', import.meta.url), 'utf8');

describe('채팅 실시간 토픽', () => {
  it('클라는 토픽을 조립하지 않는다 — 구독은 전부 서버가 내려준 값으로', () => {
    expect(DOCK).not.toMatch(/`chat(-mini)?:s\$\{/);
    const subs = [...DOCK.matchAll(/\.channel\(([^)]*)\)/g)].map((m) => m[1]!.trim());
    expect(subs.sort()).toEqual(['guildTopic', 'miniChannel', 'whisperTopic', 'worldChannel']);
  });

  it('전체 조회 응답이 월드·미니 토픽을 함께 내려준다', () => {
    expect(RECENT).toContain('worldChannel: chatTopic(serverId)');
    expect(RECENT).toContain('miniChannel: chatMiniTopic(serverId)');
  });

  it('토픽마다 토큰이 붙고, 서버·종류가 다르면 토큰도 다르다', () => {
    const tail = (t: string) => t.split(':').pop()!;
    for (const t of [chatTopic(1), chatMiniTopic(1), chatTopic(1, 7n), whisperTopic(1, 'u')]) {
      expect(tail(t)).toMatch(/^[0-9a-f]{12}$/);
    }
    expect(chatTopic(1)).not.toBe(chatTopic(2));
    expect(tail(chatTopic(1))).not.toBe(tail(chatMiniTopic(1)));
  });

  it('길드·귓속말 토큰의 계산식은 바꾸지 않는다 — 바꾸면 배포 순간 열려 있던 화면의 구독이 끊긴다', async () => {
    const { createHmac } = await import('node:crypto');
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev';
    const h = (s: string) => createHmac('sha256', secret).update(s).digest('hex').slice(0, 12);
    expect(chatTopic(1, 7n)).toBe(`chat:s1:g7:${h('chat:1:7')}`);
    expect(whisperTopic(1, 'abc')).toBe(`chat:s1:w:${h('whisper:1:abc')}`);
  });
});
