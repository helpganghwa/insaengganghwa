import { describe, expect, it } from 'vitest';

import { eraSyncDecision, type EraSyncRow } from '@/lib/game/history/era-sync-decision';

const row = (over: Partial<EraSyncRow> = {}): EraSyncRow => ({ locked: false, factsHash: 'h1', source: 'ai', proposedFactsHash: null, ...over });

describe('eraSyncDecision — 시대 요약 제안을 만들지', () => {
  it('처음 보는 시대는 제안을 만든다', () => {
    expect(eraSyncDecision(null, 'h1', false)).toBe('generate');
  });
  it('정본이 같은 사실표로 쓴 글이면 건너뛴다', () => {
    expect(eraSyncDecision(row(), 'h1', false)).toBe('skip');
  });
  it('사실표가 바뀌면 제안을 만든다', () => {
    expect(eraSyncDecision(row(), 'h2', false)).toBe('generate');
  });
  it('같은 사실표로 이미 제안했으면(대기 중이든 버렸든) 다시 만들지 않는다', () => {
    expect(eraSyncDecision(row({ proposedFactsHash: 'h2' }), 'h2', false)).toBe('skip');
  });
  it('제안 뒤 사실표가 또 바뀌면 새 제안으로 갈아 끼운다', () => {
    expect(eraSyncDecision(row({ proposedFactsHash: 'h2' }), 'h3', false)).toBe('generate');
  });
  it('집계 문장이 정본이면 사실표가 그대로여도 제안을 시도한다', () => {
    expect(eraSyncDecision(row({ source: 'code' }), 'h1', false)).toBe('generate');
  });
  it('집계 문장이 정본이어도 이미 제안한 사실표면 건너뛴다', () => {
    expect(eraSyncDecision(row({ source: 'code', proposedFactsHash: 'h1' }), 'h1', false)).toBe('skip');
  });
  it('운영자 수정본도 사실표가 같으면 건너뛴다', () => {
    expect(eraSyncDecision(row({ source: 'manual' }), 'h1', false)).toBe('skip');
  });
  it('잠긴 시대는 force여도 제안을 받지 않는다', () => {
    expect(eraSyncDecision(row({ locked: true }), 'h2', false)).toBe('locked');
    expect(eraSyncDecision(row({ locked: true }), 'h2', true)).toBe('locked');
  });
  it('force면 사실표가 같아도 새 제안을 만든다', () => {
    expect(eraSyncDecision(row(), 'h1', true)).toBe('generate');
    expect(eraSyncDecision(row({ proposedFactsHash: 'h1' }), 'h1', true)).toBe('generate');
  });
});
