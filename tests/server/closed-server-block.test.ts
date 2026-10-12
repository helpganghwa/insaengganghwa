import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 닫힌 서버 진입 차단(2026-10-12 결정: 진입 차단 + 다른 서버로 안내).
 * 관문이 닫힌 서버를 캐릭터가 있어도 거부하고, 레이아웃·헤더·전환 라우트가 운영 종료 안내(/server-closed)로 보내는
 * 연결을 고정한다 — 스테이징에 닫힌 서버가 없어 DB로는 못 재현하므로 소스 수준에서 묶는다.
 */
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('닫힌 서버 진입 차단', () => {
  it('관문은 닫힌 서버를 캐릭터가 있어도 거부한다', () => {
    const g = read('lib/game/server-guard.ts');
    expect(g).toContain("(s.status = 'closed') as is_closed"); // loadUserServers — ids에서 제외
    expect(g).toContain("s.status <> 'closed'"); // hasCharacterOn
    expect(g).toContain("export const CLOSED_ONLY = 'closed_only' as const;");
    expect(g).toContain('if (closedIds.length > 0) return CLOSED_ONLY;');
    // canEnterServer(콜백·확인 화면·심사 로그인)도 같은 조건.
    expect(read('lib/game/server-select.ts')).toContain(
      "and(eq(characters.userId, userId), eq(characters.serverId, serverId), ne(servers.status, 'closed'))",
    );
  });

  it('레이아웃은 활성 서버 상태를 읽어 닫힌 서버면 되돌리거나 안내로 보낸다', () => {
    const l = read('lib/game/layout-data.ts');
    expect(l).toContain('as srv_status');
    expect(l).toContain("p.srv_status === 'closed'");
    expect(l).toContain('if (correction === CLOSED_ONLY) return { ...DEFAULTS, closedServer: true };');
    expect(l).toContain('if (correctServerId === CLOSED_ONLY) return { ...DEFAULTS, closedServer: true };');
  });

  it('헤더·교정 컴포넌트·전환 라우트·확인 화면이 안내 화면으로 보낸다', () => {
    expect(read('components/AppHeader.tsx')).toContain('if (d.closedServer) return <ServerCorrect to="closed" />;');
    expect(read('components/ServerCorrect.tsx')).toContain("window.location.replace('/server-closed')");
    expect(read('app/auth/switch-server/route.ts')).toContain(
      "if (to === CLOSED_ONLY) return NextResponse.redirect(new URL('/server-closed', origin));",
    );
    expect(read('app/login/new-character/page.tsx')).toContain("s.status !== 'closed'");
    const page = read('app/server-closed/page.tsx');
    expect(page).toContain('NewCharacterChoice');
    expect(page).toContain('redirect(`/auth/switch-server?to=${preferred}`)'); // 운영 중인 서버가 있으면 안내 없음
  });
});
