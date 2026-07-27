# Girumo — guia operacional e kit de marca

Este diretório é a fonte operacional da identidade Girumo para marketing, comercial, produto e parceiros. A especificação aprovada continua sendo a autoridade estratégica; este pacote traduz suas decisões em regras, exemplos e masters editáveis.

## Comece aqui

- Guia navegável: `Girumo-Brand-Guide.html`
- Guia PDF publicado: `apps/web/public/brand/girumo/girumo-brand-guide.pdf`
- Tokens operacionais: `design-tokens.css`
- Entrada isolada do design-sync, somente fontes/tokens: `design-sync-tokens.css`
- Fontes portáveis e licenças: `fonts/`
- Biblioteca verbal: `copy-library.md`
- Templates sociais: `templates/social/`
- Kit comercial: `templates/commercial/`
- Assets oficiais: `apps/web/public/brand/girumo/`

## Regras inegociáveis

- Marca: **Girumo**; símbolo: **Deslocamento**.
- Logo sempre monocromático: Paper sobre Volt, Volt sobre Acid, Volt sobre Paper ou preto integral.
- Volt `#071923`, Acid `#A7FF2F`, Paper `#FFFEFA` e Canvas `#F4F0E7` sustentam a identidade. Cobalt é funcional.
- Manrope em marca/títulos; IBM Plex Sans em produto/leitura; IBM Plex Mono em dados e metadados.
- Sem gradientes, glow, glass, grid decorativo, textura gratuita, roxo, dashboard falso ou estética genérica de SaaS/IA.
- Não inventar domínio Girumo. Use `{{site}}`, `{{email_suporte}}` e `{{telefone_suporte}}`.
- Mega Stock é a **operação fundadora**, nunca cliente ou depoimento de terceiro.

## Masters sociais

- `girumo-social-square-1080x1080.svg`
- `girumo-social-portrait-1080x1350.svg`
- `girumo-social-story-1080x1920.svg`
- `girumo-video-cover-1920x1080.svg`
- `girumo-customer-proof-1080x1350.svg`
- `girumo-metric-card-1080x1350.svg`

Os textos permanecem editáveis. Cada master é autocontido: fontes WOFF2 incorporadas e logo oficial inline com wordmark em contornos, sem dependência de caminhos externos. Ao exportar, preserve o perfil sRGB e confira a peça em 100% e em miniatura.

## Kit comercial

- One-page HTML/PDF: promessa, fluxo completo, cinco módulos e próximo passo.
- Proposta DOCX/PDF: sete páginas e campos editáveis consistentes.
- Deck comercial: nove slides 16:9.
- Assinatura de e-mail, cartão digital e capa de onboarding.
- Guia de onboarding HTML/PDF: cinco páginas.

Na assinatura, substitua `{{logo_url}}` por uma URL **HTTPS, pública e absoluta** do asset oficial `apps/web/public/brand/girumo/email/girumo-email-lockup-640x160.png`. Não use caminho local ou relativo e não invente domínio Girumo; hospede o arquivo no endereço público aprovado para a operação. Os campos `{{nome}}`, `{{cargo}}`, `{{telefone}}`, `{{email}}` e `{{site}}` continuam editáveis.

## Registro de verificação

Verificação concluída em 16 de julho de 2026:

- guia de marca: 12 páginas A4, texto selecionável e inspeção página a página;
- masters sociais e aplicações SVG: oito arquivos autocontidos, XML válido, fontes WOFF2 incorporadas, logo em paths e render em resolução nativa e miniatura;
- proposta: DOCX com sete páginas lógicas e seis quebras explícitas; PDF correspondente com sete páginas renderizadas e inspecionadas;
- deck comercial: nove slides 16:9, sem overflow, sobreposição ou mídia fabricada;
- one-page: uma página; onboarding: cinco páginas; ambos renderizados e inspecionados;
- design-sync: bundle Girumo com `Logo` e `LogoSymbol`, tokens Volt e as três famílias tipográficas empacotadas.

O ambiente não tinha Word ou LibreOffice. Por isso, o DOCX não recebeu uma alegação de render nativo: sua estrutura ZIP/XML, estilos, quebras, tabelas, placeholders e fontes incorporadas foram auditados diretamente, enquanto o PDF correspondente recebeu a inspeção visual completa. O registro público e versionado dessa verificação é a lista acima; evidências temporárias locais não fazem parte do kit distribuível.
