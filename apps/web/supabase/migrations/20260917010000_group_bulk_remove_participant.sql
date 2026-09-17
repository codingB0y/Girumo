-- Ação nova em `group_bulk_jobs`: remover um participante de um grupo.
-- Usada por "remover duplicados" e "remover pessoa de todos os grupos" na
-- tela de campanha — o mesmo motor de fila, só uma ação a mais.
--
-- Aplicar nos DOIS bancos (dev wfjuwogxaupyadwhvoxy e prod nidoatbxaylrkcgbszns).
--
-- Lembrete do achado de 03/09 (ver 20260903130000_check_invite_e_revisao.sql):
-- CHECK constraint não entra no hash de `schema_signature()` — o gate de
-- drift do CI não pega esta mudança sozinho. A conferência aqui é SQL direto
-- nos dois bancos (pg_get_constraintdef), não só "o CI passou".

alter table public.group_bulk_jobs
  drop constraint if exists group_bulk_jobs_action_check;

alter table public.group_bulk_jobs
  add constraint group_bulk_jobs_action_check
  check (action = any (array[
    'set_description', 'set_picture', 'open', 'close', 'check_invite', 'remove_participant'
  ]));

-- Carga da ação nova. Mesmo espírito de `description`/`media_id`: no máximo
-- um campo de carga preenchido, conforme a ação. Dígitos com DDI, sem `+`
-- (mesmo formato que `Evolution.updateParticipant` espera em `participants`).
alter table public.group_bulk_jobs
  add column if not exists target_phone text;

comment on column public.group_bulk_jobs.target_phone is
  'Telefone (dígitos, com DDI) a remover do grupo. Só preenchido em remove_participant.';
