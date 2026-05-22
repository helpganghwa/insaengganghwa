-- system_mode 단일행 초기 시드 (key='global', mode='live').
-- 멱등: 이미 row 있으면 noop.
INSERT INTO public.system_mode (key, mode)
VALUES ('global', 'live')
ON CONFLICT (key) DO NOTHING;
