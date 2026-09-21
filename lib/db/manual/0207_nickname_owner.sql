-- 0207 (2026-09-21) 닉네임 정책 — "이름 하나에 사람 하나". 2서버 전수조사 ⑩.
--
-- 종전: characters_nickname_uq = UNIQUE(nickname) 전역 1개. 이름이 캐릭터 한 행에 묶여 있어,
--       같은 사람이 2서버에 자기 이름을 다시 쓸 수 없었다(서버마다 다른 이름을 쓰게 됨).
-- 새 규칙: 다른 사람과는 어느 서버에서도 겹칠 수 없고, **같은 계정만** 자기 이름을 다른 서버의
--       자기 캐릭터에 쓸 수 있다. 즉 이름 → 사람은 여전히 유일, 이름 → 캐릭터만 여럿이 된다.
--
-- 강제 방식 = 제외 제약(exclusion constraint). "lower(nickname)이 같은데 user_id가 다른 행이
-- 둘 있으면 거부"를 DB가 보장한다 — 앱 규율에 의존하지 않아 어드민 SQL·스크립트로도 못 뚫는다.
-- 덤으로 대소문자만 다른 사칭 이름('Admin' vs 'admin')도 함께 막힌다(종전 유니크는 대소문자 구분).
--
-- ⚠ 이 제약 위반은 SQLSTATE가 23505가 아니라 **23P01(exclusion_violation)**이다.
--   코드가 23P01을 '이미 쓰는 이름'으로 매핑하지 않으면 재추첨 루프가 죽는다.
-- ⚠ 적용 순서 = **신코드 배포 후**. 신코드는 옛 전역 유니크(23505)도 그대로 처리하므로 먼저 올라가도
--   안전하지만, 이 SQL이 먼저 가면 구코드가 23P01을 몰라 '이미 사용 중' 대신 일반 오류를 낸다.
--   적용 전 충돌 확인: select lower(nickname), count(*) from characters group by 1 having count(*) > 1;
--   (2026-09-21 프로덕션 0건 확인)
create extension if not exists btree_gist;

drop index if exists characters_nickname_uq;

alter table characters
  add constraint characters_nickname_owner_excl
  exclude using gist (lower(nickname) with =, user_id with <>);

-- 서버 안에서의 유일성 + 정확 일치 조회 인덱스. PK가 (user_id, server_id)라 위 제약과 합치면
-- 한 서버에 같은 이름이 둘일 수 없지만, 불변식을 눈에 보이게 두고 조회도 받는다.
create unique index if not exists characters_server_nickname_uq
  on characters (server_id, lower(nickname));
