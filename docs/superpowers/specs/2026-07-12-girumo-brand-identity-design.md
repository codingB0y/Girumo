# Girumo — sistema de identidade e rebranding

**Data:** 2026-07-12

**Status:** aprovada para implementação

**Substitui:** HubFlow como marca pública
**Símbolo aprovado:** Deslocamento

## 1. Decisão

A nova marca pública do produto será **Girumo**. O símbolo oficial será **Deslocamento**: duas massas quase quadradas, separadas por uma única passagem em degrau.

O conceito representa a transição entre dois estados:

- trabalho manual → operação programada;
- um grupo cheio → o próximo grupo em andamento;
- tarefas repetidas → uma operação coordenada;
- tempo operacional → tempo para vender.

O símbolo não deve ilustrar WhatsApp, mensagens, grupos ou automação. Ele funciona como ativo de marca abstrato, enquanto produto, copy e motion explicam a categoria.

## 2. Estratégia de marca

### 2.1 Categoria

SaaS de captação, organização e vendas em grupos de WhatsApp. O ciclo real do produto é:

`anúncio → landing page → entrada no grupo → organização automática → campanha agendada → venda → mensuração`

### 2.2 Público principal

Atacadistas de roupas brasileiros que operam grupos de clientes e revendedores. São usuários práticos, com pouco interesse em jargão técnico e alto interesse em economia de tempo, organização e resultado comercial.

### 2.3 Promessa central

> **Mais grupos lotados. Menos trabalho. Mais vendas.**

### 2.4 Posicionamento

Girumo é a central operacional que capta clientes, organiza grupos e mantém campanhas rodando para o atacadista focar no atendimento e nas vendas.

### 2.5 Personalidade

- tecnológica, sem parecer ferramenta para especialistas;
- operacional, sem parecer industrial ou logística;
- direta, sem linguagem de guru;
- confiável, sem estética bancária;
- enérgica, sem neon ou excesso futurista;
- comercial, sem parecer ferramenta de spam.

### 2.6 O que evitar

- símbolos de WhatsApp, balões, megafones, aviões de papel e setas de disparo;
- órbitas, redes de pontos, robôs, sparkles e códigos genéricos de IA;
- raios e gradientes usados apenas para parecer tecnológico;
- expressões como “disparo em massa”, “IA”, “método secreto”, “guru” e “líder nº 1”;
- limitar a marca ao atacado no nome ou no símbolo;
- prometer funcionalidades ainda inexistentes.

## 3. Naming e sistema verbal

### 3.1 Escrita oficial

Usar **Girumo**, com inicial maiúscula, em textos, títulos, produto e materiais comerciais.

- Correto: `Girumo`
- Evitar como assinatura principal: `girumo`, `GIRUMO`, `GiruMo`

Caixa alta é permitida apenas em labels editoriais curtos.

### 3.2 Pronúncia

`Gi-ru-mo`, com tonicidade em `ru`.

### 3.3 Tagline

Tagline institucional:

> **Mais grupos lotados. Menos trabalho. Mais vendas.**

Linha funcional curta:

> **Seus grupos rodando. Você vendendo.**

### 3.4 Arquitetura de produto

- Girumo Pages
- Girumo Grupos
- Girumo Campanhas
- Girumo Agenda
- Girumo Resultados

Os nomes de módulos permanecem em português na navegação. A construção acima é usada em apresentações, onboarding, documentação e páginas de produto.

## 4. Logo

### 4.1 Construção do símbolo

O arquivo mestre usa `viewBox="0 0 24 24"`. As duas massas devem permanecer separadas e usar a mesma cor.

```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path
    fill="currentColor"
    d="M5 2H12V10H9V22H5A3 3 0 0 1 2 19V5A3 3 0 0 1 5 2Z"
  />
  <path
    fill="currentColor"
    d="M14 2H19A3 3 0 0 1 22 5V19A3 3 0 0 1 19 22H11V14H14V2Z"
  />
</svg>
```

Regras estruturais:

- exatamente duas massas;
- exatamente uma passagem com um único deslocamento;
- nenhuma ponte entre as massas;
- nenhuma seta ou ponta direcional;
- nenhuma terceira peça, linha ou detalhe decorativo;
- a leitura deve sobreviver em uma única cor.

### 4.2 Wordmark

O wordmark usa **Girumo** em Manrope Bold, convertido em contornos nos arquivos finais.

- peso-base: 700;
- tracking óptico geral: aproximadamente `-3%`;
- apertar `Gi`, `um` e `mo` apenas o necessário para equilíbrio visual;
- preservar `ir` um pouco mais aberto;
- não usar ligaturas, cortes, `o` aberto ou letras coloridas;
- o símbolo é a assinatura proprietária; o wordmark permanece calmo.

### 4.3 Lockups

Entregas obrigatórias:

1. símbolo isolado;
2. lockup horizontal — símbolo à esquerda;
3. lockup empilhado — símbolo acima;
4. wordmark isolado para espaços horizontais restritos.

No lockup horizontal:

- o símbolo tem altura óptica de `1,06×` a altura do `G`;
- o intervalo entre símbolo e palavra equivale a aproximadamente `0,5×` a largura do `o`;
- o alinhamento é feito pelo centro óptico, não pela caixa matemática.

### 4.4 Área de proteção

Definir `x` como um quarto da largura do símbolo. Nenhum texto, borda, fotografia ou outro logo pode entrar em uma margem de `2x` ao redor do lockup.

### 4.5 Tamanhos mínimos

- símbolo digital: `16 px`;
- símbolo impresso: `5 mm`;
- lockup horizontal digital: `96 px` de largura;
- lockup horizontal impresso: `24 mm` de largura.

Uma versão micro do símbolo preservará a mesma geometria, com correção óptica apenas nos raios para impedir fechamento da passagem em 16 px.

### 4.6 Uso de cor

O logo é sempre monocromático.

Versões prioritárias:

- Volt navy sobre canvas;
- canvas sobre Volt navy;
- Volt navy sobre lima;
- preto integral para produção simples.

Não dividir as duas massas entre lima e azul. Cobalt é cor do sistema digital, não componente estrutural do logo.

## 5. Sistema de cores

### 5.1 Paleta principal — Volt Commerce

| Token | Hex | Uso |
|---|---|---|
| `volt-950` | `#071923` | logo, texto principal, fundos premium |
| `volt-900` | `#0C2835` | superfícies escuras elevadas |
| `volt-800` | `#123746` | bordas e superfícies escuras secundárias |
| `acid-500` | `#A7FF2F` | CTA primário, sinal ativo, destaque comercial |
| `cobalt-500` | `#2E66FF` | foco, seleção, estados interativos e gráficos |
| `cobalt-700` | `#1947C9` | links e texto interativo sobre canvas |
| `canvas-100` | `#F4F0E7` | fundo principal claro |
| `paper-0` | `#FFFEFA` | cards e superfícies de alta prioridade |
| `slate-600` | `#52646C` | texto secundário sobre canvas |
| `line-200` | `#D8D7CF` | divisórias e bordas claras |

### 5.2 Cores semânticas

| Token | Hex | Uso |
|---|---|---|
| `success-700` | `#0C7346` | sucesso textual e ícones |
| `warning-700` | `#7A4A00` | alertas textuais |
| `danger-700` | `#B82936` | erros textuais |
| `info-700` | `#1947C9` | informação textual |

O lima não substitui `success`. Ele representa energia da marca e ação principal.

### 5.3 Acessibilidade

- `#071923` sobre `#A7FF2F`: contraste aproximado `14,49:1`;
- `#071923` sobre `#F4F0E7`: `15,75:1`;
- `#2E66FF` sobre canvas: `4,14:1`, portanto não usar para texto normal;
- `#1947C9` sobre canvas: `6,63:1`, adequado para texto normal;
- estados nunca dependem apenas de cor: incluir ícone, label ou mudança estrutural.

## 6. Tipografia

O sistema reduz as cinco famílias atuais para três.

### 6.1 Marca e títulos

**Manrope** — pesos 500, 650 e 700.

Usos:

- wordmark-base;
- headlines da landing;
- títulos de campanhas e materiais sociais;
- números comerciais de destaque.

### 6.2 Produto e leitura

**IBM Plex Sans** — pesos 400, 500 e 600.

Usos:

- navegação;
- formulários;
- tabelas;
- textos e ajuda;
- interface do painel.

### 6.3 Dados e metadados

**IBM Plex Mono** — pesos 400 e 500.

Usos:

- horários;
- IDs;
- métricas auxiliares;
- labels técnicas curtas;
- logs e status.

### 6.4 Escala

| Nível | Tamanho/linha | Peso | Uso |
|---|---|---|---|
| Display XL | `64/64` | 700 | hero desktop |
| Display L | `48/52` | 700 | títulos de página pública |
| Heading 1 | `32/38` | 700 | cabeçalhos do produto |
| Heading 2 | `24/30` | 650 | seções e modais |
| Heading 3 | `20/26` | 650 | cards prioritários |
| Body L | `18/28` | 400 | texto de marketing |
| Body M | `16/24` | 400 | leitura padrão |
| Body S | `14/20` | 400 | interface |
| Label | `12/16` | 600 | labels e badges |
| Data | `12/16` | 500 mono | métricas auxiliares |

Em telas menores, Display XL reduz para `44/46` e Display L para `36/40`.

## 7. Design system

### 7.1 Fundamentos

- grid de espaçamento: `4 px`;
- largura de conteúdo público: até `1200 px`;
- largura confortável de leitura: `640–720 px`;
- raios: `8 px` em inputs e botões, `12 px` em cards, `16 px` em painéis de marketing;
- pills apenas para status, filtros e tags;
- bordas claras de `1 px`; sombras curtas e discretas;
- ícones de linha com `1,75 px`, cantos suaves e desenho simples.

### 7.2 Botões

- primário: fundo lima, texto Volt navy;
- secundário: fundo transparente, borda Volt navy/canvas conforme contexto;
- terciário: texto ou ícone sem caixa;
- destrutivo: danger semântico, nunca lima;
- altura padrão: `40 px`; altura de destaque: `48 px`;
- foco: outline cobalt de `2 px` com offset de `2 px`.

### 7.3 Cards e superfícies

- fundo público: canvas;
- fundo de card: paper;
- painel do SaaS: canvas com navegação Volt navy;
- superfícies dark usam Volt 950/900, sem glassmorphism;
- bordas e separação substituem sombras grandes.

### 7.4 Motion

O princípio de movimento deriva do símbolo: uma massa entrega espaço à outra.

- microinterações: `160–220 ms`;
- transições de página: `240–320 ms`;
- easing padrão: `cubic-bezier(0.22, 1, 0.36, 1)`;
- evitar loops decorativos permanentes;
- respeitar `prefers-reduced-motion`;
- motion de marca pode deslocar a passagem uma única vez, nunca girar o símbolo.

### 7.5 Linguagem gráfica

Usar:

- blocos deslocados;
- canais e recortes em espaço negativo;
- grids incompletos;
- grandes áreas de canvas;
- linhas de percurso apenas em ilustração de produto;
- lime como ponto focal único.

Evitar:

- auroras, blobs e gradientes genéricos;
- cards flutuantes sem função;
- redes de bolinhas;
- textura futurista gratuita;
- excesso de arredondamento;
- dashboards falsos em materiais de marca.

## 8. Direção de imagem e conteúdo

Fotografia deve mostrar operações reais de atacado: estoque, separação de pedidos, celular em contexto, grupos e bastidores de venda. Preferir cenas documentais, luz natural ou flash controlado e enquadramentos próximos.

Evitar:

- pessoas genéricas em escritório;
- robôs e imagens de IA;
- mockups de celular desconectados da rotina;
- estética de agência de tráfego ou infoproduto;
- fotografia de moda editorial que esconda a natureza operacional do negócio.

Tratamento de imagem:

- overlay Volt navy entre 12% e 28% quando necessário;
- recortes ortogonais com um único deslocamento;
- lime usado apenas em labels e sinais, nunca como filtro fotográfico.

## 9. Aplicações obrigatórias

### 9.1 Produto digital

- sidebar e mobile navigation;
- tela de login e recuperação;
- topbar e favicon;
- estados vazios;
- páginas Girumo Pages;
- e-mails transacionais;
- metadados e Open Graph;
- PWA e atalhos mobile.

### 9.2 Social

- avatar de Instagram: símbolo Volt navy sobre lima;
- avatar alternativo: símbolo canvas sobre Volt navy;
- templates `1080×1080`, `1080×1350` e `1080×1920`;
- capa e thumbnail de vídeo;
- prova social e cards de métricas.

O símbolo deve ocupar entre 58% e 64% da área útil do avatar, com margem de segurança para o recorte circular.

### 9.3 Comercial

- proposta PDF;
- apresentação comercial;
- one-page de produto;
- assinatura de e-mail;
- cartão digital;
- material de onboarding.

## 10. Arquivos exportáveis

Estrutura prevista:

```text
apps/web/public/brand/girumo/
├── svg/
│   ├── girumo-symbol-volt.svg
│   ├── girumo-symbol-canvas.svg
│   ├── girumo-symbol-black.svg
│   ├── girumo-lockup-horizontal-volt.svg
│   ├── girumo-lockup-horizontal-canvas.svg
│   ├── girumo-lockup-stacked-volt.svg
│   └── girumo-wordmark-volt.svg
├── png/
│   ├── symbol-16.png
│   ├── symbol-32.png
│   ├── symbol-48.png
│   ├── symbol-180.png
│   ├── symbol-192.png
│   ├── symbol-512.png
│   └── symbol-1024.png
├── social/
│   ├── instagram-avatar-1080.png
│   ├── instagram-avatar-dark-1080.png
│   └── og-default-1200x630.png
├── email/
│   └── girumo-email-lockup-640x160.png
├── favicon.ico
└── girumo-brand-guide.pdf
```

Os SVGs finais do wordmark devem conter paths, não depender da fonte instalada.

## 11. Migração HubFlow → Girumo

### 11.1 Alterações públicas

- substituir o componente de logo atual;
- atualizar metadata, títulos, descrições e Open Graph;
- substituir assets em `apps/web/public/brand`;
- migrar tokens roxos e cobalto legado para Volt Commerce;
- atualizar landing, autenticação, painel, admin e navegação mobile;
- atualizar e-mails e `LOGO_URL`;
- atualizar posts e gerador OG;
- revisar todas as strings públicas “HubFlow”.

### 11.2 Alterações internas adiadas

Para reduzir risco operacional, a primeira entrega não renomeia:

- nomes de pacotes e diretórios;
- serviços de infraestrutura;
- variáveis de ambiente;
- tabelas, migrations e identificadores de banco;
- nomes históricos em documentos e changelogs;
- projeto/slug de deploy antes da definição de domínio.

Esses identificadores podem migrar em uma fase técnica separada sem impacto público.

### 11.3 Compatibilidade

- rotas públicas atuais continuam funcionando durante a migração;
- redirecionamentos de domínio serão definidos apenas após aquisição e validação jurídica;
- links enviados anteriormente não podem quebrar;
- assets antigos permanecem temporariamente até a confirmação de que e-mails e caches não os referenciam.

## 12. Validação

### 12.1 Marca

- símbolo legível em 16 px;
- leitura consistente em preto, Volt e canvas;
- lockup equilibrado em fundos claros e escuros;
- avatar reconhecível em recorte circular;
- nenhuma versão depende de gradiente ou duas cores;
- clear space e tamanhos mínimos documentados.

### 12.2 Acessibilidade

- contraste WCAG AA para texto normal;
- foco visível em teclado;
- estados sem dependência exclusiva de cor;
- motion reduzido respeitado;
- logos com texto alternativo quando comunicam marca e `aria-hidden` quando decorativos.

### 12.3 Produto

- build e lint sem novas falhas;
- smoke tests de landing, login, signup, painel, admin, campanhas e páginas públicas;
- verificação visual em desktop e mobile;
- busca por “HubFlow” distingue referências públicas residuais de identificadores internos intencionais;
- e-mails, favicon, PWA, Open Graph e compartilhamento social verificados em ambiente de preview.

### 12.4 Qualidade de arquivos

- SVGs válidos, sem imagens incorporadas;
- PNGs com transparência correta;
- favicon contém 16, 32 e 48 px;
- arquivos sociais exportados em sRGB;
- wordmark convertido em outlines;
- nomes de arquivo seguem a estrutura definida.

## 13. Sequência de implementação

1. Construir e validar o pacote vetorial do logo.
2. Exportar favicons, avatares e imagens sociais.
3. Criar tokens Girumo sem remover imediatamente os tokens legados.
4. Atualizar o componente central de logo.
5. Migrar superfícies públicas.
6. Migrar produto, autenticação e admin.
7. Atualizar e-mails, OG, PWA e metadata.
8. Remover tokens e assets legados somente após busca e testes.
9. Executar QA visual, acessibilidade e regressão funcional.
10. Publicar o brand guide final.

## 14. Limites e dependências

Não fazem parte desta primeira implementação:

- alteração de funcionalidades do SaaS;
- redesign estrutural de todos os fluxos do painel;
- troca de domínio sem aquisição prévia;
- renomeação de banco, infraestrutura e engine;
- registro de marca.

Antes do lançamento público, **Girumo** e o símbolo devem passar por busca profissional no INPI, validação de domínio e análise jurídica. A triagem preliminar feita durante o naming não constitui liberação legal.

## 15. Critério de conclusão

O rebranding está concluído quando:

- todos os arquivos exportáveis existem e foram verificados;
- as superfícies públicas e autenticadas exibem Girumo;
- não há resíduos públicos acidentais de HubFlow;
- contraste, responsividade e estados foram testados;
- identificadores internos preservados estão documentados;
- o brand guide corresponde aos assets realmente usados no produto.
