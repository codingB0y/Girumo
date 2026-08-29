-- Solicitacoes de demonstracao agendada (modo demonstracao, /demo).
--
-- SEM tenant_id de proposito: quem preenche este formulario AINDA NAO TEM conta
-- — e exatamente o ponto do paid-first. Nao ha tenant a que atribuir a linha, e
-- inventar um so para satisfazer coluna seria mentira no dado.
--
-- RLS ligada assim mesmo, por defesa em profundidade. NENHUMA policy: a tabela
-- e escrita e lida so por service-role. E deny-all por DESENHO, nao por
-- acidente — diferente das 13 policies inertes descritas no CLAUDE.md, que
-- dependem de GUC que o app nunca seta.
create table if not exists public.demo_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null,
  step_reached int,
  source       text not null default 'demo',
  -- Quando o aviso de venda saiu. NULL = a linha existe mas ninguem foi
  -- avisado; e o que se consulta quando um lead "sumiu".
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.demo_requests enable row level security;

-- O admin lista por data. Sem indice isto e seq scan desde a primeira consulta.
create index if not exists demo_requests_created_at_idx
  on public.demo_requests (created_at desc);
