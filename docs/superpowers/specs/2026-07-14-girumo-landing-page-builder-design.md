# Girumo — Criador de landing pages para captação em grupos de WhatsApp

**Data:** 14 de julho de 2026  
**Status:** design aprovado; aguardando revisão da especificação  
**Escopo:** evolução do criador e das landing pages públicas de captação

## 1. Resumo executivo

O Girumo oferecerá landing pages curtas, mobile-first e voltadas a atacadistas de roupas. Todas terão um único objetivo: capturar nome e WhatsApp do visitante e, após o salvamento do lead, liberar o acesso ao grupo da loja.

A solução adotará um editor guiado com layouts protegidos. O lojista poderá trocar identidade, textos e mídias, mas não poderá arrastar elementos, alterar livremente espaçamentos, enviar fontes ou inserir código. A primeira versão oferecerá seis modelos percebidos pelo usuário, construídos a partir de três estruturas reutilizáveis e duas direções visuais por estrutura.

Esse desenho busca equilibrar quatro objetivos:

1. qualidade visual comparável a uma landing page criada por um designer experiente;
2. publicação rápida por pessoas sem conhecimento de design;
3. preservação da conversão e da acessibilidade;
4. custo técnico controlado para evoluir, testar e manter os modelos.

## 2. Problema observado

A tela atual possui uma boa base: seleção de modelo, formulário de edição, preview ao vivo e salvamento como rascunho. Entretanto, a experiência ainda apresenta limitações:

- os modelos são apresentados como cartões de texto, sem miniaturas visuais suficientes para uma escolha informada;
- a foto é preenchida por URL, exigindo conhecimento técnico desnecessário;
- os campos aparecem em uma lista longa, sem uma hierarquia clara;
- o preview não prioriza o uso real em celular;
- a landing atual se aproxima de um formulário genérico dentro de um cartão;
- o usuário tem poucas opções de identidade, mas ainda não conta com um sistema visual completo;
- não há evidência, na tela analisada, de métricas nativas para comparar a conversão de páginas e modelos.

## 3. Objetivos

### 3.1 Objetivos do produto

- Permitir que um lojista publique uma página válida em até três minutos quando já possuir textos e mídia.
- Entregar páginas visualmente diferentes sem manter seis implementações isoladas.
- Impedir personalizações que prejudiquem hierarquia, legibilidade, responsividade ou conversão.
- Capturar o lead antes de revelar ou abrir o link do grupo.
- Medir o funil desde a visualização até o clique para entrar no grupo.
- Manter as páginas rápidas em redes móveis.

### 3.2 Objetivos do visitante

- Entender rapidamente qual loja está fazendo o convite.
- Entender o benefício de entrar no grupo.
- Saber que tipo de conteúdo ou oferta receberá.
- Informar nome e WhatsApp com pouco esforço.
- Receber acesso ao grupo somente após uma captura bem-sucedida.

## 4. Não objetivos da primeira versão

- Editor drag-and-drop.
- Upload de fontes próprias.
- Edição livre de HTML, CSS ou JavaScript.
- Reordenação arbitrária de blocos.
- Biblioteca aberta de componentes criados pelo usuário.
- Teste A/B automatizado com divisão de tráfego.
- Geração completa da página por inteligência artificial.
- Modelos com mais de quatro seções de conteúdo.
- Contagem regressiva e depoimentos complexos como componentes obrigatórios.
- Edição de campos ao clicar diretamente no preview.

O esquema de eventos deve permitir a introdução futura de testes A/B sem migração destrutiva.

## 5. Princípios de experiência

1. **Mobile-first:** a visualização de celular será a padrão no editor e a experiência pública terá uma coluna principal.
2. **Um objetivo:** não haverá menu de navegação nem links concorrentes com a captura.
3. **Modelos protegidos:** cada opção já determinará tipografia, espaçamentos, estilo do botão, proporções e comportamento responsivo.
4. **Personalização segura:** o usuário altera marca e conteúdo; o Girumo controla o sistema visual.
5. **Poucos campos:** nome e WhatsApp com DDD serão os únicos campos de lead na primeira versão.
6. **Valor antes ou junto do pedido:** a promessa e a identidade da loja devem aparecer antes do formulário ou no mesmo primeiro bloco.
7. **Medição desde o início:** cada versão publicada deverá ser identificável nos eventos de conversão.

## 6. Arquitetura dos modelos

### 6.1 Estruturas reutilizáveis

#### Estrutura A — Conversão imediata

Indicada para promoção, catálogo disponível e campanhas com promessa direta.

- Hero com identidade, oferta, mídia e formulário visíveis rapidamente.
- Bloco curto de até três vantagens.
- Galeria ou informações comerciais opcionais.
- Duas ou três seções, com formulário incorporado ao hero.

#### Estrutura B — Coleção editorial

Indicada para lançamento, nova coleção e posicionamento mais premium.

- Hero visual com CTA que leva ao formulário.
- Galeria compacta de produtos ou categorias.
- Bloco de valor e formulário.
- Três seções por padrão; quarta seção apenas quando houver conteúdo relevante.

#### Estrutura C — Vitrine em vídeo

Indicada para mostrar peças, detalhes, provador ou apresentação da coleção.

- Hero com capa do vídeo e mensagem principal.
- Vídeo carregado mediante ação do visitante, sem reprodução automática com áudio.
- Até três destaques ou benefícios.
- Formulário de captura.

### 6.2 Direções visuais

Cada estrutura possuirá duas direções visuais:

- **Premium/editorial:** composição mais espaçada, tipografia sofisticada, cores moderadas e protagonismo das imagens.
- **Comercial/impactante:** contraste mais alto, título mais direto, elementos de oferta e maior densidade visual controlada.

Isso gera seis modelos visíveis na galeria:

| Estrutura | Premium/editorial | Comercial/impactante |
| --- | --- | --- |
| Conversão imediata | Acesso VIP | Oferta Impacto |
| Coleção editorial | Drop Editorial | Catálogo Direto |
| Vitrine em vídeo | Coleção em Movimento | Lançamento Flash |

Os nomes poderão ser ajustados comercialmente sem alterar a arquitetura.

### 6.3 Contrato de um modelo

Cada modelo será descrito por uma configuração versionada que informa:

- identificador da estrutura e da direção visual;
- versão do modelo;
- campos exibidos no editor;
- limites de caracteres;
- quantidade e proporção das mídias;
- componentes opcionais permitidos;
- tokens visuais e regras responsivas;
- mapeamento de conteúdo ao trocar de modelo.

Os modelos devem compartilhar componentes de renderização e um conteúdo universal sempre que possível. Uma mudança interna em um componente não poderá exigir alterações manuais em todas as páginas salvas.

## 7. Fluxo do lojista

### 7.1 Escolha do modelo

A tela inicial exibirá seis miniaturas reais, priorizando a aparência mobile. Cada cartão conterá:

- nome do modelo;
- descrição de uma linha;
- indicação de uso sugerido;
- ação para visualizar em tamanho maior;
- ação “Usar este modelo”.

A escolha não será feita apenas por cor ou texto. O estado selecionado deverá ter indicação visual e semântica.

### 7.2 Editor

Em telas grandes, o editor ocupará o painel esquerdo e o preview o painel direito. A área de trabalho terá altura controlada, evitando que a página externa e o preview criem uma rolagem confusa. Em telas menores, o usuário alternará entre editar e visualizar.

O editor será organizado em grupos recolhíveis:

1. **Identidade da loja**
   - nome obrigatório;
   - logo opcional;
   - cor principal.
2. **Chamada principal**
   - selo curto opcional;
   - título;
   - descrição;
   - texto do CTA dentro de opções seguras ou com limite curto.
3. **Mídia e conteúdo**
   - upload de foto, galeria ou vídeo conforme o modelo;
   - ajuste de recorte e ponto focal;
   - descrição alternativa sugerida pelo sistema e editável;
   - até três vantagens, categorias ou informações comerciais.
4. **Captação**
   - nome e WhatsApp fixos na página pública;
   - link do grupo;
   - mensagem de sucesso;
   - aviso curto de privacidade gerado com o nome da loja.
5. **Rastreamento**
   - UTMs preservadas automaticamente;
   - pixels e identificadores permitidos;
   - nenhuma inserção de script arbitrário.

### 7.3 Personalização permitida

O lojista poderá alterar:

- nome e logo;
- cor principal, com paleta derivada automaticamente;
- textos dentro dos limites do modelo;
- fotos, galeria, capa e vídeo;
- até três itens de conteúdo complementar;
- link do grupo e mensagem pós-captura;
- configurações autorizadas de rastreamento.

Não poderá alterar:

- fontes;
- espaçamentos;
- tamanhos livres;
- estilo do botão;
- ordem arbitrária das seções;
- código ou estrutura responsiva.

### 7.4 Limites de conteúdo e mídia

Limites universais da primeira versão:

- selo: até 30 caracteres;
- título: até 72 caracteres;
- descrição principal: até 180 caracteres;
- CTA: até 32 caracteres;
- cada item complementar: título de até 40 e descrição de até 90 caracteres;
- galeria: de duas a seis imagens, conforme o modelo;
- logo: PNG, JPEG ou WebP de até 5 MB;
- imagem: PNG, JPEG ou WebP de até 10 MB por arquivo;
- vídeo: MP4 ou MOV, duração máxima de 60 segundos e arquivo-fonte de até 100 MB.

O Girumo criará derivados otimizados e não servirá o arquivo-fonte diretamente na landing pública. Cada modelo poderá impor limites menores, nunca maiores, quando sua composição exigir.

### 7.5 Preview e checklist

O preview deverá:

- abrir no modo celular;
- alternar entre celular e desktop;
- atualizar sem publicar;
- representar a rolagem real da página;
- mostrar o estado real do formulário.

Antes da publicação, o Girumo verificará:

- link de convite com formato válido para grupo do WhatsApp;
- campos obrigatórios;
- mídia mínima exigida pelo modelo;
- contraste gerado pela cor da marca;
- tamanho e formato dos arquivos;
- aviso de privacidade preenchido com o nome da loja;
- configuração válida de rastreamento.

## 8. Landing page pública

### 8.1 Estrutura

- Uma coluna principal em celular.
- Duas ou três seções por padrão; quatro somente quando justificadas pelo conteúdo.
- Sem navegação ou links externos concorrentes.
- Um único objetivo de conversão.
- CTA fixo no celular apenas quando o formulário estiver abaixo da primeira dobra; o CTA levará ao mesmo formulário.
- Rodapé mínimo com identificação da loja e links jurídicos; o rodapé não contará como seção.

### 8.2 Formulário

Campos fixos:

- **Nome**;
- **WhatsApp com DDD**.

Requisitos:

- rótulos visíveis, não apenas placeholders;
- teclado e preenchimento automático adequados em celular;
- normalização do telefone para formato internacional;
- aceitação de números brasileiros válidos com DDD;
- erros em texto junto ao campo, sem depender apenas de cor;
- preservação do conteúdo em caso de falha;
- botão desabilitado enquanto o envio estiver em processamento.

Texto recomendado do botão:

> Quero receber ofertas no grupo

Aviso recomendado abaixo do botão:

> Ao continuar, você autoriza a [Nome da loja] a enviar ofertas pelo WhatsApp e solicita acesso ao grupo. Você poderá sair quando quiser. Política de Privacidade.

Não haverá checkbox na primeira versão. O clique, a versão do aviso e o contexto da captura serão registrados. A redação e a base legal deverão ser validadas juridicamente antes do lançamento.

### 8.3 Pós-captura

1. O visitante envia o formulário.
2. O Girumo valida e normaliza os dados.
3. O contato é criado ou atualizado dentro da conta da loja.
4. Uma captura específica da página/campanha é registrada sem duplicar contatos.
5. O evento de lead criado é emitido.
6. A tela de sucesso libera a ação para abrir o grupo.
7. O clique no grupo é registrado antes da abertura do link.

O link do grupo não será liberado se o lead não tiver sido salvo. Em uma falha temporária, o formulário manterá os dados e oferecerá nova tentativa.

## 9. Modelo conceitual de dados

### 9.1 Página

- loja/tenant proprietário;
- slug e URL pública;
- status: rascunho, publicada ou arquivada;
- estrutura, direção visual e versão do modelo;
- conteúdo universal;
- identidade visual derivada;
- link do grupo;
- versão do aviso de privacidade;
- configurações de rastreamento;
- versão publicada e datas.

### 9.2 Contato

- loja/tenant proprietário;
- nome mais recente;
- telefone normalizado;
- datas de criação e atualização;
- estado de exclusão ou bloqueio quando aplicável.

O mesmo telefone não deverá criar contatos duplicados dentro da mesma loja. Uma nova campanha poderá atualizar o contato e gerar uma nova captura associada à página.

### 9.3 Captura

- página e versão publicada;
- contato;
- data e identificador idempotente do envio;
- origem, referrer e UTMs;
- dispositivo;
- modelo e versão;
- versão do aviso apresentado;
- estado do clique para o grupo.

Todas as consultas e gravações deverão respeitar o isolamento entre lojas.

## 10. Métricas

Eventos mínimos:

- `page_view`;
- `form_start`;
- `lead_submit_attempt`;
- `lead_created`;
- `group_click`.

Dimensões mínimas:

- loja;
- página e versão publicada;
- modelo, estrutura e direção visual;
- dispositivo;
- origem, referrer e UTMs;
- data.

Indicadores:

- conversão em lead = `lead_created / page_view`;
- avanço ao grupo = `group_click / lead_created`;
- conversão por modelo e versão;
- conversão por origem e dispositivo;
- falhas de envio do formulário.

Os eventos deverão ser idempotentes quando necessário para que recarregamentos e cliques repetidos não inflem as métricas.

## 11. Desempenho e mídia

- Entregar imagens dimensionadas para o dispositivo em formatos modernos quando suportados.
- Carregar imediatamente apenas a mídia necessária na primeira dobra.
- Aplicar carregamento tardio às mídias abaixo da primeira dobra.
- Usar imagem de capa para vídeo e carregar o player somente após interação.
- Não reproduzir vídeo com áudio automaticamente.
- Comprimir uploads e impedir arquivos acima dos limites definidos.
- Reservar dimensões das mídias para evitar saltos de layout.
- Minimizar JavaScript na página pública.

Metas de campo para a página pública, no percentil 75:

- LCP de até 2,5 segundos;
- INP de até 200 milissegundos;
- CLS de até 0,1.

## 12. Acessibilidade

A meta da primeira versão é WCAG 2.2 nível AA nos fluxos principais.

- Contraste mínimo de 4,5:1 para texto normal.
- Rótulos programaticamente associados aos campos.
- Ordem de leitura coerente.
- Uso completo por teclado.
- Foco visível.
- Erros anunciados e descritos em texto.
- Botões e áreas de toque adequados para celular.
- Alt text editável ou gerado a partir de uma descrição simples.
- Respeito à preferência de redução de movimento.
- Estados de carregamento e sucesso comunicados além de mudanças de cor.

Uma análise visual não comprova conformidade; testes automatizados e manuais serão exigidos.

## 13. Privacidade e segurança

- Coletar apenas nome, telefone e metadados necessários à conversão e medição.
- Exibir claramente o nome da loja e o tipo de comunicação esperada.
- Registrar a versão do aviso apresentado ao visitante.
- Disponibilizar caminho de saída, bloqueio ou exclusão conforme a política adotada.
- Validar juridicamente os papéis do Girumo e da loja, a base legal e os prazos de retenção.
- Isolar dados por tenant.
- Sanitizar todos os textos inseridos pelo lojista.
- Aceitar apenas tipos de mídia permitidos e validar conteúdo, extensão e tamanho.
- Não permitir scripts arbitrários nos campos de pixel ou rastreamento.
- Aplicar honeypot e limite de requisições por página e origem; apresentar desafio adicional apenas quando houver sinais de abuso.

## 14. Tratamento de erros

### Editor

- Upload interrompido: preservar os demais campos e permitir retentativa isolada.
- Arquivo inválido: explicar formato, tamanho e proporção esperados.
- Link de grupo inválido: bloquear publicação e indicar correção.
- Contraste insuficiente: ajustar automaticamente a cor derivada e explicar a alteração.
- Troca de modelo: mapear o conteúdo universal; dados incompatíveis ficam preservados, mas ocultos, e o usuário recebe um aviso.
- Falha de salvamento automático: mostrar estado não salvo e oferecer nova tentativa sem apagar alterações locais.

### Página pública

- Telefone inválido: erro junto ao campo e foco no primeiro problema.
- Falha de rede: preservar dados e oferecer nova tentativa.
- Envio repetido: usar chave idempotente para evitar duplicação da captura.
- Lead salvo, mas evento analítico falhou: não impedir o acesso ao grupo; registrar a falha para retentativa.
- Link do grupo indisponível após publicação: exibir uma mensagem configurável e registrar o erro operacional.

## 15. Compatibilidade e migração

- URLs públicas existentes devem continuar funcionando.
- Páginas atuais serão mapeadas para o modelo Oferta Impacto, preservando a versão anterior para reversão.
- Conteúdo, leads, UTMs e pixels existentes devem ser preservados.
- A migração deverá manter uma cópia da configuração publicada anterior para reversão.
- O novo editor poderá ser liberado por feature flag antes da migração geral.

## 16. Estratégia de testes

### Unitários

- validação e normalização de telefone;
- limites de conteúdo;
- geração de paleta e contraste;
- mapeamento entre modelos;
- idempotência dos eventos.

### Integração

- upload, transformação e recuperação de mídia;
- criação/atualização de contato e registro da captura;
- isolamento entre tenants;
- publicação e resolução da versão pública;
- pixels e UTMs permitidos.

### Ponta a ponta

- escolher cada um dos seis modelos, editar, publicar, capturar lead e abrir o grupo;
- falha de rede e retentativa;
- troca de modelo sem perda de conteúdo;
- migração de página existente;
- celular e desktop.

### Visuais, acessibilidade e desempenho

- snapshots dos seis modelos nos principais tamanhos de tela;
- teste de textos curtos, máximos e conteúdo ausente;
- auditoria automatizada e navegação manual por teclado;
- teste com leitor de tela no formulário;
- Lighthouse em laboratório e Web Vitals em produção;
- validação do recorte e do ponto focal de cada proporção de mídia.

## 17. Critérios de aceite

1. A galeria apresenta seis modelos visualmente distintos, baseados em três estruturas compartilhadas.
2. Um usuário consegue criar e publicar uma página válida sem fornecer URL de imagem ou editar código.
3. As páginas usam de duas a quatro seções e mantêm um único objetivo de conversão.
4. Nome e WhatsApp são validados e salvos antes de o link do grupo ser liberado.
5. Um telefone repetido não cria contatos duplicados dentro da mesma loja, mas uma nova captura pode ser atribuída a outra página.
6. Os cinco eventos mínimos aparecem com página, versão, modelo, origem e dispositivo.
7. Todos os modelos funcionam nos tamanhos mobile e desktop definidos.
8. O usuário não consegue quebrar tipografia, espaçamento, contraste ou responsividade com os controles disponíveis.
9. Uma falha de rede não apaga os dados preenchidos.
10. Páginas existentes continuam acessíveis após a migração.
11. O formulário possui rótulos, foco, mensagens de erro e operação por teclado.
12. A redação de privacidade e o fluxo de permissão são revisados juridicamente antes do lançamento.

## 18. Ordem recomendada de entrega

1. Estrutura de conteúdo universal, versionamento e eventos.
2. Estrutura Conversão imediata com as duas direções visuais.
3. Novo editor, upload de mídia e preview mobile.
4. Captura, deduplicação, sucesso e rastreamento do clique no grupo.
5. Estruturas Coleção editorial e Vitrine em vídeo.
6. Migração das páginas atuais, testes e liberação gradual.

## 19. Referências de decisão

- [Unbounce — mobile landing pages e foco em uma ação](https://unbounce.com/landing-page-examples/best-mobile-landing-page-examples/)
- [W3C WAI — rótulos de formulários](https://www.w3.org/WAI/tutorials/forms/labels/)
- [W3C WAI — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
- [web.dev — Largest Contentful Paint](https://web.dev/articles/lcp)
- [web.dev — desempenho de vídeo](https://web.dev/learn/performance/video-performance)
- [Meta — obtenção de permissão para mensagens no WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)
- [ANPD — guia de legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf/@@display-file/file)
