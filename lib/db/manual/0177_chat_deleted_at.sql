-- 0177 본인 채팅 삭제 (2026-08-26)
-- 유저가 자기 메시지를 지우면 본문 대신 "삭제된 메시지입니다." 자리표시가 남는다(대화 맥락 보존).
-- hidden_at(운영 숨김 — 목록에서 제거)과 의미를 분리: deleted_at은 **노출은 되되 본문만 가린다**.
-- 원문은 보존 — 어드민 검수·신고 조사는 원문으로(운영 화면은 '삭제' 배지 + 원문).

alter table chat_messages add column if not exists deleted_at timestamptz;
alter table whisper_messages add column if not exists deleted_at timestamptz;
