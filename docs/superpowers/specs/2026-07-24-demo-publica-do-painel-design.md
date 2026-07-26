# Demonstração pública do painel

Data: 2026-07-24

## Objetivo

Permitir que uma pessoa conheça o fluxo completo da Girumo sem criar conta, conectar o WhatsApp ou expor dados próprios. A demonstração deve deixar claro como a plataforma funciona na prática: conexão, grupos, campanhas, contatos e resultados.

## Decisões aprovadas

- A demonstração será pública em `/demo` e não exigirá autenticação.
- Nenhuma ação da demo consultará a engine, Supabase ou qualquer API de dados reais.
- A pessoa inicia com uma conexão de WhatsApp simulada e, depois, navega por um painel preenchido com dados fictícios.
- A interface mostrará de forma persistente que os dados são de demonstração.
- As interações terão apenas efeito local e temporário, sem disparar mensagens, criar recursos reais ou persistir alterações.
- A conversão acontece por um CTA para `/signup`.

## Abordagens consideradas

### Demo dentro do painel autenticado

Facilitaria o treinamento de clientes existentes, mas não apresenta valor antes do cadastro e mistura conceitualmente a conta real com uma simulação.

### Painel estático em uma landing page

É rápido de publicar, porém não demonstra o fluxo de conexão nem permite experimentar a navegação e as ações do produto.

### Rota pública com estado simulado local

Escolhida. Entrega a jornada completa antes do cadastro, mantém isolamento técnico e permite interações sem risco operacional.

## Experiência do usuário

Ao abrir `/demo`, a pessoa vê uma tela de boas-vindas que explica que é uma demonstração segura e que nenhum WhatsApp será conectado. Um botão `Iniciar demonstração` revela uma etapa de QR Code ilustrativo.

Ao selecionar `Simular conexão`, a interface mostra uma transição curta para `WhatsApp conectado` com um número fictício. O CTA passa a levar para o painel demo.

No painel, a navegação reproduz as áreas principais do produto:

1. Início com visão geral de grupos, contatos e resultados.
2. Campanhas com uma campanha ativa e métricas simuladas.
3. Grupos com ocupação e desempenho de exemplo.
4. Contatos captados pela campanha fictícia.
5. Resultados com indicadores e evolução fictícia.

Um selo `Modo demonstração` permanece visível no cabeçalho. Botões de ação, como criar campanha ou enviar mensagem, devem resultar em feedback local claro, por exemplo `Campanha simulada criada`, sem comunicação externa. Ações que não agregarem valor à demonstração podem ficar desabilitadas com uma explicação curta.

O CTA `Criar minha conta` deve estar presente no cabeçalho e ao final da experiência, direcionando para `/signup`.

## Arquitetura

Criar uma fronteira explícita de demo, sem reaproveitar chamadas das rotas reais. A rota e seus componentes devem receber um modelo local de dados e um pequeno estado de jornada no cliente.

Unidades propostas:

- `apps/web/src/app/demo/page.tsx`: entrada pública e metadados da experiência.
- `apps/web/src/components/demo/demo-experience.tsx`: controla as etapas `intro`, `connecting` e `dashboard` no navegador.
- `apps/web/src/components/demo/demo-dashboard.tsx`: exibe as áreas do painel usando somente o modelo demo.
- `apps/web/src/lib/demo-data.ts`: dados determinísticos e tipados para conexão, grupos, campanhas, contatos e métricas.

A demo não deve importar stores que leem ou escrevem dados de tenant, nem fazer `fetch` para `/api/engine`, `/api/session`, `/api/groups`, `/api/campanhas`, `/api/leads` ou outras rotas de operação. Os componentes podem reutilizar elementos visuais puros do painel quando eles não contiverem chamadas de dados.

## Modelo de dados e fluxo

`demo-data.ts` será a única fonte inicial de dados. Ele conterá um perfil fictício de loja, uma sessão conectada, grupos, campanha, contatos e métricas coerentes entre si.

O estado da conexão é estritamente local:

- Inicial: conexão não simulada.
- Após `Simular conexão`: sessão exibida como conectada.
- Após acessar o painel: todos os dados continuam provenientes do mesmo modelo local.

Interações de demonstração devem atualizar somente o estado React em memória. Recarregar a página restabelece o cenário inicial, o que reforça que nada foi salvo.

## Estados e erros

- A tela inicial explica que não há conexão real nem leitura de QR Code.
- A etapa de conexão deve ser conclusiva e não depender de temporizadores, rede ou resposta externa.
- Se uma ação simulada estiver indisponível, o feedback deve informar que ela está bloqueada no modo demonstração e oferecer o CTA de cadastro.
- A demo deve continuar utilizável caso JavaScript seja carregado lentamente: a página apresenta uma estrutura inicial e os controles aparecem quando o cliente hidrata.

## Segurança e privacidade

- Não usar credenciais, URLs de engine ou variáveis de ambiente para renderizar a demo.
- Não incluir números, grupos, nomes ou métricas originados de clientes reais.
- Não expor endpoints internos nem permitir que parâmetros da URL alterem o cenário para acessar dados.
- Não persistir dados em banco, local storage ou cookies; o estado dura apenas na memória da página.

## Verificação

Validar:

- `/demo` é acessível sem sessão autenticada.
- Nenhuma chamada de rede para engine, Supabase ou APIs do painel ocorre durante a navegação.
- A simulação muda de desconectada para conectada e abre o painel preenchido.
- Os dados carregados são claramente rotulados como demonstração.
- Interações não fazem `fetch`, não persistem dados e produzem feedback local.
- Os CTAs levam para `/signup`.
- Lint, testes focados aplicáveis e build passam.

## Fora de escopo

- Conta demo persistente ou acesso de avaliação com login.
- Personalização dos dados pelo visitante.
- Envio de mensagens, QR Code real, engine emulada no servidor ou qualquer integração de WhatsApp.
- Alteração dos fluxos reais de conexão, painel ou dados de clientes.
