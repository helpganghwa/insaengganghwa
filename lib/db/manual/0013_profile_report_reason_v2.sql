-- profile_report_reason ENUM: 사용자 노출 사유를 4종(nickname/avatar/bug_abuse/other)으로 재편.
-- 기존 5종(nsfw/violence/hate/quality/impersonation)은 과거 row 호환을 위해 그대로 둠.
-- ALTER TYPE ADD VALUE는 IF NOT EXISTS로 멱등.
ALTER TYPE profile_report_reason ADD VALUE IF NOT EXISTS 'nickname';
ALTER TYPE profile_report_reason ADD VALUE IF NOT EXISTS 'avatar';
ALTER TYPE profile_report_reason ADD VALUE IF NOT EXISTS 'bug_abuse';
