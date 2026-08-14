-- Trigger functions should not inherit a caller-controlled search path.

alter function public.set_updated_at() set search_path = public;
