
INSERT INTO public.app_secrets (name, value)
VALUES ('cron_allowed_ips', '')
ON CONFLICT (name) DO NOTHING;
