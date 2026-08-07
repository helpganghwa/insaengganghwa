-- 귓속말 대화 목록 인덱스 (2026-08-07 배포 전 감사 §6).
-- listWhisperThreads는 `from_user_id = me or to_user_id = me`로 내 대화를 모으는데,
-- to 쪽만 인덱스가 있어(whisper_to_idx) 플래너가 그 서버의 귓속말을 전량 스캔했다.
-- from 쪽 인덱스를 짝으로 두면 BitmapOr로 양쪽을 좁힐 수 있다.
-- 테이블이 비어 있는 지금이 생성이 가장 싸다(운영 중 생성은 잠금 부담).
create index if not exists whisper_from_idx on public.whisper_messages (server_id, from_user_id, id desc);
