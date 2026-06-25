# Auditoria de Produto - HUBFLOW

Data: 2026-06-24  
Escopo: fluxo publico de entrada e barreira de autenticacao em producao  
Destino: pasta local `docs/design-audit/hubflow-product-audit-2026-06-24`

## Evidencias Capturadas

1. `01-home-viewport.png` - Home publica
2. `02-login-viewport.png` - Login
3. `03-signup-viewport.png` - Cadastro
4. `04-protected-hoje-login-wall.png` - `/hoje` redirecionando para login
5. `05-protected-campaigns-login-wall.png` - `/campaigns` redirecionando para login

Manifestos tecnicos:

- `capture-manifest.json`
- `clean-capture-manifest.json`

## Objetivo Do Usuario

O usuario-alvo precisa entender rapidamente o valor do HUBFLOW, criar conta, entrar no painel e operar crescimento via WhatsApp com seguranca: leads, ofertas, campanhas, reativacao, planos e conexao da engine.

## Lista De Passos Auditados

1. Home publica - Saude geral: media
2. Login - Saude geral: boa com riscos de contraste/clareza
3. Cadastro - Saude geral: boa com lacunas de confianca
4. Acesso a rota protegida `/hoje` - Saude geral: funcional, mas pouco contextual
5. Acesso a rota protegida `/campaigns` - Saude geral: funcional, mas pouco contextual

## Pontos Fortes

- A proposta da home e direta: lotar grupos de WhatsApp e vender mais. O texto fala com um publico especifico, especialmente atacadistas de moda.
- O CTA principal da home e claro e aparece acima da dobra.
- Login e cadastro tem estrutura simples, sem excesso de campos.
- Rotas protegidas redirecionam corretamente para login com `next`, preservando a intencao do usuario.
- O produto ja tem linguagem comercial forte: revendedoras, grupos, vendas, WhatsApp e piloto automatico.

## Riscos De UX

### 1. A identidade publica ainda parece mais landing page do que SaaS operacional

Evidencia: `01-home-viewport.png`, `02-login-viewport.png`, `03-signup-viewport.png`

A home, login e cadastro usam fundo escuro, gradiente roxo/azul e composicao mais promocional. Isso cria um contraste forte com o painel interno que esta sendo redesenhado para ser mais neutro, denso e operacional.

Risco: o usuario pode sentir que entrou em outro produto depois do login. Para SaaS B2B operacional, consistencia visual ajuda confianca.

Recomendacao:

- Manter a home com energia comercial, mas reduzir o excesso de gradiente escuro.
- Aproximar login/cadastro do novo padrao do app: fundo neutro, card mais funcional, linguagem de seguranca e operacao.

### 2. Login wall perde contexto da rota original

Evidencia: `04-protected-hoje-login-wall.png`, `05-protected-campaigns-login-wall.png`

Ao tentar acessar `/hoje` ou `/campaigns`, o usuario cai no login generico. O redirect tecnico funciona, mas a tela nao explica que ele sera levado de volta para a pagina desejada.

Risco: usuarios vindos de link direto podem nao ter certeza se estao no fluxo correto.

Recomendacao:

- Exibir uma linha contextual quando houver `next`, por exemplo: `Entre para continuar para Hoje` ou `Entre para acessar Ofertas`.
- Depois do login, confirmar visualmente que o retorno funcionou.

### 3. Cadastro ainda nao comunica o que acontece depois

Evidencia: `03-signup-viewport.png`

O cadastro e limpo, mas a promessa depois do clique esta pouco explicita. O usuario nao sabe se vai direto para o painel, se precisa conectar WhatsApp, escolher plano ou confirmar email.

Risco: queda no signup por incerteza, especialmente em SaaS com WhatsApp/Stripe/Supabase onde o usuario espera algum setup.

Recomendacao:

- Adicionar microcopy curta abaixo do botao: `Depois disso voce cria sua organizacao e conecta o WhatsApp.`
- Se houver plano free, indicar `Comece gratis` de forma honesta.

### 4. Home tem mensagem forte, mas com carga cognitiva alta no hero

Evidencia: `01-home-viewport.png`

O headline e especifico, mas longo. A combinacao de headline grande, subtitulo, CTA, selo, nav, gradiente e mockup cria uma primeira dobra intensa.

Risco: para usuarios menos digitais, a tela pode parecer sofisticada demais antes de parecer simples.

Recomendacao:

- Reduzir o headline para uma promessa mais curta.
- Colocar detalhes como `Brás, Madrugada, Mega Moda` em apoio, nao como elemento principal.
- Mostrar uma prova operacional mais concreta logo abaixo: `1. Conecte WhatsApp`, `2. Capture leads`, `3. Envie ofertas`, `4. Veja vendas`.

### 5. O app protegido nao pode ser avaliado visualmente sem sessao autenticada

Evidencia: todas as rotas internas auditadas redirecionaram para login.

Isso e correto do ponto de vista de seguranca, mas limita a auditoria visual das telas internas em producao.

Recomendacao:

- Fazer uma segunda rodada com sessao logada para auditar `/hoje`, `/leads`, `/campaigns`, `/crescer`, `/settings`, `/groups`, `/templates`, `/schedules` e `/reports`.
- Capturar tambem estados vazios, estados com dados e erros de API.

## Riscos De Acessibilidade

### 1. Contraste e legibilidade em fundo escuro com gradiente

Evidencia: `01-home-viewport.png`, `02-login-viewport.png`, `03-signup-viewport.png`

Alguns textos secundarios em cinza sobre fundo escuro podem ficar abaixo do ideal para usuarios com baixa visao ou telas de menor qualidade.

Recomendacao:

- Aumentar contraste de textos secundarios.
- Evitar texto pequeno em cinza sobre roxo/azul escuro.

### 2. Foco visual dos inputs parece muito dependente de cor

Evidencia: `02-login-viewport.png`, `03-signup-viewport.png`

O estado de foco existe visualmente, mas depende de halo claro. Em acessibilidade, foco precisa ser forte e consistente.

Recomendacao:

- Garantir ring de foco com contraste suficiente.
- Testar navegacao por teclado em login, cadastro, forgot password e botao principal.

### 3. Formulario de cadastro nao mostra politica, termos ou tratamento basico de dados

Evidencia: `03-signup-viewport.png`

Para um produto que processa contatos, WhatsApp e dados de clientes, a tela de cadastro deveria reforcar privacidade e responsabilidade.

Recomendacao:

- Adicionar links discretos para termos e privacidade.
- Incluir microcopy de seguranca: `Seus contatos ficam na sua organizacao.`

## Oportunidades De Produto

1. Unificar visual publico e app interno.
   A nova direcao interna e mais madura para SaaS. A home pode continuar vendedora, mas login/cadastro devem parecer extensao do produto, nao uma campanha separada.

2. Transformar login/cadastro em primeira etapa de onboarding.
   O usuario deve entender que o proximo passo e criar organizacao, escolher plano e conectar WhatsApp.

3. Criar uma experiencia de primeiro acesso.
   Depois do signup, a ordem ideal parece ser: organizacao -> plano/free -> conectar WhatsApp -> criar primeira instancia -> importar/sincronizar grupos -> primeira oferta.

4. Expor confianca antes do cadastro.
   Como o produto lida com WhatsApp, contatos e disparos, mensagens de seguranca, LGPD, limites anti-ban e controle por tenant deveriam aparecer antes da conta.

## Limites Da Auditoria

- A auditoria usou evidencias visuais capturadas em producao.
- As rotas internas redirecionaram para login; portanto, os achados visuais do painel interno exigem nova captura com usuario autenticado.
- Nao foi feito teste completo de teclado, leitor de tela, zoom 200%, contraste calculado por ferramenta ou fluxo real de checkout.
- Nao foram enviadas credenciais, tokens ou dados sensiveis durante a auditoria.

## Recomendacoes Prioritarias

1. Redesenhar login e cadastro para aproximar do novo padrao operacional do app.
2. Adicionar contexto de `next` no login quando o usuario vem de rota protegida.
3. Criar microcopy de onboarding no cadastro explicando o que acontece apos criar conta.
4. Reduzir a intensidade visual da home e trazer prova operacional mais concreta.
5. Rodar segunda auditoria autenticada das telas internas antes de fechar o design do MVP online.

## Atualizacao Implementada

Status em 2026-06-24:

- Recomendacoes 1, 2 e 3 foram implementadas no produto.
- `AuthShell` foi redesenhado para se aproximar do padrao SaaS operacional.
- Login passou a mostrar contexto de retorno quando existe `next`.
- Login passou a sanitizar `next` para aceitar apenas caminhos internos.
- Cadastro passou a explicar o proximo passo apos criar conta e reforcar isolamento por tenant.

Pendencias:

- Revisar a home publica.
- Rodar nova captura visual de login/cadastro apos deploy.
- Rodar auditoria autenticada das telas internas.
