-- 0116: 문의 이미지 첨부 (2026-07-13)
-- support_inquiries에 첨부 이미지 스토리지 경로 배열. 파일 실체는 private 버킷
-- inquiry-attachments(코드가 멱등 생성) — 어드민 열람은 signed URL. 멱등(IF NOT EXISTS).

ALTER TABLE support_inquiries
  ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}';
