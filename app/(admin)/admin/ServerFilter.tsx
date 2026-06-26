/**
 * 서버 필터 — 관리자 목록을 특정 서버로 좁히는 pill 네비(전체 / srv1 / srv2 …).
 * 서버 분리(쿠키 전환)가 아니라, 전 서버를 한 화면에서 보고 `?srv=`로 필터링하는 방식.
 * 다른 검색 파라미터(date·q·status 등)는 보존. 서버가 1개뿐이면 노이즈라 렌더 생략.
 */
export function ServerFilter({
  basePath,
  servers,
  current,
  params = {},
}: {
  basePath: string;
  servers: { id: number; name: string }[];
  current: number | null;
  params?: Record<string, string | undefined>;
}) {
  if (servers.length < 2) return null; // 단일 서버 운영 중엔 숨김(서버 추가 시 자동 노출)

  const href = (srv: number | null) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && k !== 'srv') sp.set(k, v);
    if (srv != null) sp.set('srv', String(srv));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 ${active ? 'border-amber-500 bg-amber-900/30 text-amber-300' : 'border-zinc-700 text-zinc-400'}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-zinc-500">서버</span>
      <a href={href(null)} className={pill(current == null)}>
        전체
      </a>
      {servers.map((s) => (
        <a key={s.id} href={href(s.id)} className={pill(current === s.id)}>
          srv{s.id}
        </a>
      ))}
    </div>
  );
}

/** searchParams의 `srv` 문자열 → 유효 serverId | null(전체). 라우트 공용 파서. */
export function parseServerFilter(srv: string | undefined): number | null {
  if (srv == null || srv === '' || srv === 'all') return null;
  const n = Number(srv);
  return Number.isInteger(n) && n >= 1 && n <= 32767 ? n : null;
}
