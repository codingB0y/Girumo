-- Registro de aceite dos documentos legais no cadastro.
--
-- Fecha o buraco que o card `legal-termos-privacidade` apontava: os documentos
-- foram publicados em 26/08 (PR #154), mas nenhuma conta registrava aceite. Sem
-- este registro, `/termos` e `/privacidade` sao paginas que ninguem concordou
-- com nada — e a LGPD (art. 8o, §1o) poe o onus da prova do consentimento em
-- quem trata o dado, incluindo provar QUAL versao o titular aceitou.
--
-- Uma linha por documento, nao uma por aceite: hoje o usuario marca um checkbox
-- so e `LEGAL_VERSION` cobre os dois textos, mas guardar separado deixa
-- versionar Termos e Politica de forma independente depois sem reinterpretar
-- registro antigo.
--
-- `on delete cascade` no auth.users e deliberado: pedido de eliminacao de conta
-- (LGPD art. 18, VI) leva junto o registro de consentimento daquela pessoa.
-- Guardar prova de aceite de conta apagada seria manter dado pessoal sem base.
--
-- Escrita e so por service-role — os dois caminhos que criam conta passam pelo
-- servidor. A unica policy e de leitura do proprio aceite, no padrao
-- `auth.uid()` que funciona (as 99 policies vivas do projeto), nao no padrao de
-- GUC de sessao que o app nunca seta e que deixou 13 policias inertes.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid references public.organizations (id) on delete set null,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  source text not null default 'signup' check (source in ('signup', 'google_oauth')),
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);

-- Idempotencia: reenviar o mesmo aceite (retry de rede, duplo clique) nao pode
-- gerar duas linhas. Serve tambem de indice para "esta pessoa ja aceitou a
-- versao corrente?", que e a pergunta que um banner de re-aceite fara.
create unique index if not exists legal_acceptances_user_document_version_key
  on public.legal_acceptances (auth_user_id, document, version);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_select_self on public.legal_acceptances;
create policy legal_acceptances_select_self
  on public.legal_acceptances
  for select
  to authenticated
  using (auth_user_id = auth.uid());

comment on table public.legal_acceptances is
  'Prova de consentimento aos documentos legais: quem, quando, qual versao, de que IP. Escrita SO por service-role, nos dois caminhos que criam conta (/api/auth/signup e /api/auth/oauth-complete). A unica policy deixa o titular ler o proprio aceite; nao criar policy de insert/update/delete aqui — registro de consentimento e append-only por natureza.';

comment on column public.legal_acceptances.version is
  'Valor de LEGAL_VERSION (apps/web/src/lib/legal.ts) no momento do aceite. Ao mudar o texto dos documentos, sobe a constante e os aceites novos passam a gravar a versao nova; os antigos continuam provando o texto antigo.';
