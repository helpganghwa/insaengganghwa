# lib/db/manual — 수동 SQL

Drizzle가 자동 생성하지 못하는 스키마/데이터 변경을 손으로 작성한 SQL. 라이브 DB에 실제로 적용된 변경의 출처(`lib/db/migrations`의 Drizzle 자동 생성 SQL과 함께 스키마의 진실 원천을 이룬다).

## 규칙

- **모든 파일은 멱등** — `IF NOT EXISTS` / `DO $$ ... $$` 가드로 재적용해도 안전.
- 파일명은 `NNNN_설명.sql` 순번. 헤더 주석에 **무엇을·왜**를 기록.
- 한 파일 = 한 논리 변경 = 원자 트랜잭션(실패 시 부분 적용 없음).

## 적용 / 재구성

- **개별 적용**: `bun run scripts/apply-migration.ts <file>`
- **전체 재구성(파괴적)**: `bun run scripts/db-rebuild.ts --confirm`
  스키마를 통째로 drop 후 `migrations` + `manual`을 **멀티패스**로 재적용한다.
  Drizzle/manual 두 계열은 시간상 교차 의존(예: drizzle guild_* ↔ manual 0036 guilds)이라
  단순 정렬순으론 깨지지만, 모든 파일이 멱등이라 실패한 것만 다음 패스에서 재시도하면 의존성이 자동 해소된다.

> 스키마를 처음부터 다시 세울 때는 손으로 SQL을 순서대로 돌리지 말고 **항상 `db-rebuild.ts`** 를 쓴다 — 교차 의존 해소가 이 스크립트에만 들어 있다.
