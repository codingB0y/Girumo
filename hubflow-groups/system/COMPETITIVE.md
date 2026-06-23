# Teardown DevZapp — módulo de Grupos (do vídeo oficial, 2026-06-22)

Modelo deles: **Campanha** = um conjunto de grupos gerido junto (1 número conectado).
Abas dentro da campanha: Grupos · Mensagens · Agendamentos · Canal · Comunidades · Relatórios.

## Inventário de funções (DevZapp)
**Campanha/config:** status do número, data início/fim, cliques totais, leads totais; exportação
diária automática de contatos (2h da manhã); **Pixel do Facebook + evento** no link; janela de envio
de boas-vindas (ex: 6h-23h, começa 9h); avisos de link quebrado / número bloqueado/desconectado;
moderação de comunidade (remove quem comenta sem ser admin); **anti-invasão** (detecta msg de não-admin
em grupo fechado mandada por OUTRA ferramenta → exclui msg + remove participante + remove lead);
allowlist de números que podem mandar msg; aviso quando alguém cria agendamento.

**Grupos:** criar grupos EM MASSA pela ferramenta (limite por plano) com auto-config (nome, #identificador,
admin, capa, descrição, "só admin envia/aprova"); importar grupos do número / de outra campanha; ativar/
inativar grupo p/ captação (controla se lead entra pelo link); blacklist global; validar/atualizar link
do grupo; excluir grupo só da ferramenta; por grupo = cliques + nº de pessoas + última entrada.

**Mensagens (composer rico):** tipo texto / **anexos (imagem, vídeo, áudio, PDF)** / link com preview /
**enquete (poll) sim-não → dispara webhook/DM individual** / **evento do WhatsApp** / envio de contato.
**MARCAR TODOS (@)** — menção invisível (só notifica com @, não polui a msg); boas-vindas automática
disparada **quando o grupo bate X cliques (lota)**; favoritar/duplicar/preview/enviar agora.

**Agendamentos (agenda AÇÕES, não só msg):** recorrente/único, intervalo mín 3 min; enviar msg; mudar
nome/imagem/descrição do grupo; **promover admin**; exportar contatos; automação de canais/comunidades.

**Relatórios:** export simplificado (nome+tel) vs detalhado (1 coluna por grupo); entrada/saída de grupos
(planos top); por campanha/data.

**Links:** redirecionamento principal · com cookies · página de redirecionamento · **links extras**
(nome, cliques-alvo, evento/ID do Facebook) associáveis a grupo específico; deixam mais cliques que a
capacidade (rotação entre grupos conforme lotam).

**Sistema:** DevChat (multiatendimento), canais, comunidades, FAQ/tutoriais, tema, idioma, funil de DM.

## LACUNAS nossas vs DevZapp — STATUS
1. ✅ **Disparo com FOTO e VÍDEO** FEITO (2026-06-22) — upload no app (foto ≤6MB / vídeo ≤20MB), engine
   envia image/video + legenda pela fila. (áudio/PDF dá p/ estender no mesmo media-store.)
2. ✅ **Marcar todos (@)** FEITO — menção invisível de todos os participantes.
3. ✅ **Pixel do Facebook no link** FEITO — /r/ vira página intersticial que dispara Lead e redireciona.
4. ✅ **Enquete (poll)** FEITO — tipo de oferta enquete, enviada como poll do WhatsApp.
5. ⬜ **Link que rota entre grupos** quando lota (hoje 1 link = 1 grupo). Médio.
6. ⬜ Criar grupos em massa + auto-config; agendar AÇÕES de grupo (nome/imagem/promover admin); export de
   contatos; relatório entrada/saída. (operação em massa — média/baixa prioridade pro nosso nicho.)

## ONDE NÓS GANHAMOS (não perder isso)
- DevZapp mede LEAD/clique/entrada/saída — mas NÃO mede VENDA nem recompra. Nós temos **registro de
  pedido + alerta de recompra + funil de venda + saúde do negócio**. Eles operam grupo; nós provamos venda.
- **Indicação premiada** (member-get-member com ranking/recompensa) — eles não têm.
- **Kit de Anúncio Meta** (copy+público+criativo gerados) — eles têm pixel, não o kit criativo.
- **Atividade real do grupo** (interagiram) no funil.

## Ordem de build recomendada (fechar lacuna sem perder diferencial)
1. Disparo multimídia (foto) → 2. Marcar todos (@) → 3. Pixel do FB no link → 4. Enquete.
Mantém nosso eixo (resultado/venda) e nos põe em pé de igualdade no que o atacadista usa todo dia.

---

# Teardown 2 — PRINTS da UI do DevZapp (2026-06-22)

Igor mandou 4 prints reais do painel. Revelam o que o vídeo não mostrava: o DevZapp tem uma
**camada de LINK/REDIRECIONAMENTO** ("Configurações Básicas") que é o motor real de "lotar grupo" —
distinta da nossa fila anti-ban (que é de ENVIO de mensagem). A deles controla a ENTRADA de leads.

## Configurações Básicas (camada de redirecionamento — NÃO temos)
- **Quantidade de Clicks** (badge BÁSICO, "Proteção contra bloqueio do WhatsApp"): limite máx de cliques
  por link/grupo; ao atingir, o redirecionamento pro grupo PARA. Ex.: 1024. Controla lotação (cap do
  WhatsApp ~1024 membros) e protege o número limitando o fluxo de entrada.
- **Dias em Cache** (badge BÁSICO, "Controle de leads duplicados"): janela em dias p/ contar só 1 clique
  por lead via COOKIE. '0' desabilita. Exige redirecionamento com link URL c/ cookie.
  → Nós já deduplicamos por TELEFONE no servidor (mais forte que cookie por navegador). Paridade parcial.
- **Randomizador de Links** (badge AVANÇADO, toggle, "Distribuição automática inteligente"): distribui os
  acessos entre os links dos grupos da campanha (balanceia volume), evita sobrecarregar 1 link; "ideal p/
  campanhas com muitos grupos / lançamento". = nossa lacuna #5 (link que rota entre grupos), agora confirmada.

## Visão geral (dashboard da campanha)
- KPIs: CLICKS · ENTRARAM · SAIRAM · PARTICIPANTES · GRUPOS · **GRUPOS CHEIOS** · **GRUPOS DISPONÍVEIS**.
  → "Cheios vs Disponíveis" = conceito de CAPACIDADE/lotação + roteamento de lead novo só p/ grupo disponível.
  Nós temos a contagem de membros por grupo (groups.json) mas não o conceito de cheio/disponível.
- Gráficos por hora: "Saída e Entrada de leads" + "Cliques em redirecionamento" (filtro últimos 7 dias).
- Sub-abas de saúde: Grupos · **Monitoramento (3)** · **Avisos (4)** · **Segurança (NEW)**.

## Abas da campanha (deles) e nosso status
Visão geral · Grupos · **Comunidades**(✗) · Mensagens · Disparos NOVO(✅) · **SuperLeads** NOVO(✗, propósito
desconhecido) · Agendamentos(✅) · Relatórios(parc.) · **Métricas de cliques**(parc., temos /links) ·
**Config. grupos automáticos**(✗, criar/config grupos em massa) · **Monitoramento**(✗) · **Links extras**(✗) ·
**Canais**(✗).

## Leitura estratégica
- O "anti-bloqueio" do DevZapp é majoritariamente CONTROLE DE FLUXO no LINK (cap de cliques, cookie,
  rotação, cheio/disponível) — não pacing de envio. É o coração da promessa "lotar grupo no automático":
  não só conta clique, DISTRIBUI o lead entrante entre os grupos respeitando a capacidade.
- Nosso /r/ é a semente disso, mas falta: cap por grupo, rotação de link, e roteamento cheio/disponível.
- Nosso diferencial segue intacto e downstream do lead (venda/recompra/indicação/funil). Eles dominam o
  upstream (distribuição de entrada); nós dominamos o downstream (prova de venda).

## Lacunas novas (priorização do PM em system/NEXT.md / changelog ao construir)
- ⬜ **Cap de cliques por grupo + roteamento cheio/disponível** (o "lotar" de verdade respeitando o limite).
- ⬜ **Randomizador/rotação de links** entre os grupos da campanha.
- ⬜ KPIs "Grupos cheios / disponíveis" no painel (barato, já temos members).
- ⬜ Monitoramento/Avisos/Segurança (link quebrado, número caiu, anti-invasão).
- ⬜ Comunidades / Canais (suporte a WhatsApp Communities/Channels) — avaliar relevância pro nicho.
- ⬜ SuperLeads — descobrir o que é antes de decidir.
