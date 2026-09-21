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
--
-- ⚠ 두 번째 컬럼은 `user_id`가 아니라 **`(user_id::text)` 표현식**으로 둔다(뜻은 같다 — uuid가 다르면 글자도 다르다).
--   user_id를 그대로 넣으면 플래너가 `where user_id = ?` 조회에 이 GiST 인덱스를 고른다. GiST 비용 추정은
--   선두 컬럼이 아닌 조건도 싸다고 보는데, 실제로는 **인덱스 전체를 읽는다**(10만 행 모의: 1,474페이지·9~54ms,
--   기본키로는 0.04ms). 로그인 콜백·서버 관문이 그 형태의 조회라 유저가 늘수록 느려지는 함정이 된다.
--   표현식이면 그 조회가 이 인덱스를 아예 쓸 수 없고, 닉네임으로 찾는 조회(선두 컬럼)는 그대로 빠르게 탄다.
-- 멱등 — 먼저 내리고 다시 건다(옛 정의 `user_id with <>`가 걸려 있던 스테이징에서도 그대로 재적용된다).
create extension if not exists btree_gist;

drop index if exists characters_nickname_uq;

alter table characters drop constraint if exists characters_nickname_owner_excl;
alter table characters
  add constraint characters_nickname_owner_excl
  exclude using gist (lower(nickname) with =, (user_id::text) with <>);

-- 서버 안에서의 유일성 + 정확 일치 조회 인덱스. PK가 (user_id, server_id)라 위 제약과 합치면
-- 한 서버에 같은 이름이 둘일 수 없지만, 불변식을 눈에 보이게 두고 조회도 받는다.
create unique index if not exists characters_server_nickname_uq
  on characters (server_id, lower(nickname));
