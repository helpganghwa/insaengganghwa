/**
 * 연대기 생성 시험(2026-09-24) — 프롬프트·검증기를 바꾼 뒤 실제 날짜로 **저장 없이**(dryRun) 생성해
 * 본문·검사 위반·토큰 사용량·소요 시간을 남긴다. 판끼리 비교할 때 쓴다(Anthropic API 과금 있음, 하루치 약 $0.2).
 *
 * 사용: DATABASE_URL=<읽을 DB> bun --conditions=react-server scripts/chronicle-eval.ts <태그> <YYYY-MM-DD>... [--out=<폴더>] [--server=1]
 * 사실표는 DB에서 읽기만 한다(dryRun은 world_chronicle에 쓰지 않고, 생성 잠금도 잡지 않는다).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { generateAndStoreChronicle } from '@/lib/game/guild/conquest/chronicle';

const args = process.argv.slice(2);
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const [tag, ...days] = args.filter((a) => !a.startsWith('--'));
if (!tag || days.length === 0) {
  console.error('사용: bun --conditions=react-server scripts/chronicle-eval.ts <태그> <YYYY-MM-DD>... [--out=<폴더>] [--server=1]');
  process.exit(1);
}
const dir = flag('out') ?? `${tmpdir()}/chronicle-eval`;
const serverId = Number(flag('server') ?? 1);
mkdirSync(dir, { recursive: true });
for (const d of days) {
  const t0 = Date.now();
  const r = await generateAndStoreChronicle(d, serverId, { dryRun: true });
  if (!r.preview) {
    console.log(`${tag} ${d} 생성 없음(${r.reason})`);
    continue;
  }
  const p = r.preview;
  const sec = Math.round((Date.now() - t0) / 1000);
  writeFileSync(`${dir}/${tag}-${d}.json`, JSON.stringify({ day: d, sec, ...p, digest: undefined }, null, 1));
  console.log(
    `${tag} ${d} sec=${sec} calls=${p.usage.calls} in=${p.usage.input} out=${p.usage.output} cacheR=${p.usage.cacheRead} cacheW=${p.usage.cacheWrite} len=${p.today.length} issues=${p.issues.length}`,
  );
}
process.exit(0);
