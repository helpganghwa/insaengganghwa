-- 0092: 기본 아바타 중복 삽입 원천 차단
-- 같은 (유저, 서버)에 동일한 기본 아바타(isDefault)가 두 번 들어가지 못하게 부분 유니크 인덱스.
-- createCharacter가 (경합·수동 재실행 등으로) 두 번 실행돼도 DB가 중복을 거부한다.
-- 적용 전 기존 중복은 정리 완료. 유저 지정(비-default) 아바타는 대상 아님(WHERE 절로 한정).

create unique index if not exists uq_default_avatar_per_char
on public.user_profiles (user_id, server_id, pixellab_character_id)
where (options->>'isDefault') = 'true';
