-- Prova de que tabela NOVA de public nasce sem escrita para authenticated.
-- Cria tabelas de verdade e TERMINA EM EXCECAO DE PROPOSITO: a excecao desfaz tudo
-- (tabelas e o default privilege mexido no caso 2), e a mensagem dela e o resultado.
--
-- Roda depois de 20261004120000_authenticated_sem_escrita_em_public, nos dois bancos:
--   supabase db query --linked -f ..\..\infra\tests\authenticated-sem-escrita-prova.sql
--
-- Esperado: erro com o texto 'PROVA OK (desfeita)'. Qualquer outro texto e falha.
--
--   caso 1  create table como postgres: default privilege + trigger
--   caso 2  default privilege reaberto so dentro da prova (simula o grantor
--           supabase_admin, que a migracao nao alcanca): so o trigger segura
--   caso 3  grant por coluna dado de proposito sobrevive a um ALTER TABLE depois
do $$
declare
  c1 text;
  c2 text;
  c3 boolean;
begin
  create table public.__prova_auth_1 (id int);
  select string_agg(p.priv, ',') into c1
    from (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
   where has_table_privilege('authenticated', 'public.__prova_auth_1', p.priv);

  alter default privileges for role postgres in schema public
    grant insert, update, delete, truncate on tables to authenticated;
  create table public.__prova_auth_2 (id int);
  select string_agg(p.priv, ',') into c2
    from (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
   where has_table_privilege('authenticated', 'public.__prova_auth_2', p.priv);

  grant update (id) on public.__prova_auth_2 to authenticated;
  alter table public.__prova_auth_2 add column x int;
  c3 := has_column_privilege('authenticated', 'public.__prova_auth_2', 'id', 'UPDATE');

  if c1 is null and c2 is null and c3 then
    raise exception 'PROVA OK (desfeita): tabela nova sem escrita (com e sem default privilege); grant por coluna sobreviveu ao ALTER';
  end if;
  raise exception 'PROVA FALHOU (desfeita): caso1=% caso2=% caso3_grant_sobreviveu=%',
    coalesce(c1, 'fechada'), coalesce(c2, 'fechada'), c3;
end $$;
