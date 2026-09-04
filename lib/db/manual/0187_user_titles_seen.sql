-- 0187: 새 칭호 표시(2026-09-03, 유저 건의) — 획득 후 아직 확인하지 않은 칭호를 NEW로 보여준다.
--  - user_titles.seen_at: NULL = 아직 확인 안 함. 칭호 페이지가 렌더 직후(after) 전부 now()로 채우고,
--    /me 메뉴 배지는 NULL 개수. 기존 보유분은 **전부 확인됨으로 채워** 업데이트 이후 획득분부터만 NEW가 뜬다(사용자 결정).
--  - characters.titles_judged_at: /me 진입 시 판정 스로틀(1시간). 칭호 페이지 판정도 갱신한다.
--  ⚠ 새 코드 배포 전 1회만. 배포 후 다시 돌리면 update가 그 사이 획득한 칭호의 NEW 표시를 전부 지운다.
--  ⚠ ALTER는 user_titles·characters(최다 접근 테이블)에 ACCESS EXCLUSIVE 락 — 긴 트랜잭션 뒤에 줄 서지 않도록 5초 상한.
begin;
set local lock_timeout = '5s';

alter table user_titles add column if not exists seen_at timestamptz;
update user_titles set seen_at = now() where seen_at is null;
-- /me 배지·칭호 페이지 NEW 조회: (user, server) 범위에서 seen_at is null만 — 부분 인덱스로 가볍게.
create index if not exists user_titles_unseen_idx on user_titles (user_id, server_id) where seen_at is null;

alter table characters add column if not exists titles_judged_at timestamptz;

commit;
