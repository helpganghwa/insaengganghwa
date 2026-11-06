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

## CONCURRENTLY 인덱스 적용(트랜잭션 밖)

`create/drop index concurrently`는 트랜잭션 안에서 실행할 수 없어 `apply-migration.ts`(트랜잭션 방식)로는 돌리지 않는다.
세션 풀러나 직접 연결로 `psql -v ON_ERROR_STOP=1 "<연결>" -c '<한 문장>'`처럼 **한 문장씩** 실행한다(트랜잭션 풀러 금지).

1. 만든 뒤 `select indexrelid::regclass, indisvalid from pg_index where indexrelid::regclass::text = '<이름>'`로 `true`인지 확인한다.
   중간에 끊겨 `false`(INVALID)로 남았으면 `drop index concurrently <이름>` 후 다시 만든다(`if not exists`는 INVALID를 그냥 넘긴다).
2. 옛 인덱스를 지우는 파일(예: 0252b)은 새 인덱스가 유효하고 대상 쿼리 플랜이 새 인덱스를 쓰는 것을 확인한 **뒤에만** 실행한다.

현재 대상: 0250(raid_attacks 유저·시각), 0251(supply_open_logs 판정용), 0252a(enhancement_jobs 진행 중 완료 시각) → 확인 → 0252b(옛 전체 인덱스 삭제).
코드는 이 인덱스들에 의존하지 않아 배포 전후 아무 때나 적용해도 된다(칭호 랭킹 스냅샷·0249 순서는 docs/TITLES.md).
