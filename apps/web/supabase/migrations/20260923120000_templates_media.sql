-- Biblioteca: copy pode levar uma foto ou um video anexado. media_id e o id
-- opaco de /api/media (storage path em base64url, nao FK); a rota valida que o
-- path pertence ao tenant antes de gravar.
alter table public.templates
  add column if not exists media_id text,
  add column if not exists media_type text,
  add column if not exists media_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'templates_media_type_check') then
    alter table public.templates
      add constraint templates_media_type_check
      check (media_type is null or media_type in ('image', 'video'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'templates_media_pair_check') then
    alter table public.templates
      add constraint templates_media_pair_check
      check ((media_id is null) = (media_type is null));
  end if;
end $$;
