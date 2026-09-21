import { listServerRows } from './actions';
import { ServersClient } from './ServersClient';

export const dynamic = 'force-dynamic';

/**
 * 서버 상태(2026-09-21 ⑮) — open/full/closed 전환. 종전에는 `servers`를 쓰는 코드가 오픈
 * 스크립트의 INSERT 하나뿐이라 포화 전환·긴급 차단이 전부 수동 SQL이었다.
 */
export default async function AdminServersPage() {
  const rows = await listServerRows();
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-5">
      <h1 className="text-lg font-bold">서버 상태</h1>
      <p className="mb-4 mt-1 text-[12px] leading-relaxed text-zinc-500">
        크론은 <b>정상·포화</b> 서버만 돈다. <b>닫힘</b>으로 두면 그 서버의 점령전·대난투·정산이
        멈추므로, 최근 접속자가 남아 있으면 막는다.
      </p>
      <ServersClient rows={rows} />
    </main>
  );
}
