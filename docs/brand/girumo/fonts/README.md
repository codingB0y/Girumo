# Fontes do kit Girumo

Os WOFF2 deste diretório mantêm o design-sync e os SVGs autocontidos. O peso 500 de IBM Plex Mono é um arquivo Medium real e separado; `font-synthesis: none` não depende de falso negrito.

- Manrope: projeto Google Fonts, licença SIL Open Font License 1.1 em `OFL-Manrope.txt`.
- IBM Plex Sans e IBM Plex Mono: projeto IBM Plex, licença SIL Open Font License 1.1 em `OFL-IBM-Plex.txt`.

## PowerPoint e uso desktop

O deck `../templates/commercial/girumo-sales-deck.pptx` referencia fontes de sistema. Antes de abri-lo para edição, instale os TTF de `desktop/`:

- Manrope 500, 600 e 700; o TTF variável oficial cobre o eixo 200–800 e fica disponível para aplicativos compatíveis;
- IBM Plex Sans 400, 500, 600 e 700;
- IBM Plex Mono 400 e IBM Plex Mono Medium 500.

No Windows, feche o PowerPoint, selecione os TTF estáticos, clique com o botão direito e escolha **Instalar para todos os usuários**. No macOS, abra os arquivos pelo Catálogo de Fontes e escolha **Instalar**. Reabra o PowerPoint somente depois da instalação. Para evitar fontes duplicadas em versões antigas do Office, prefira os TTF estáticos; instale `Manrope-Variable.ttf` apenas se o aplicativo oferecer suporte a fontes variáveis.

Os arquivos IBM são cópias do repositório oficial IBM Plex. `Manrope-Variable.ttf` é a distribuição oficial do Google Fonts; os três TTF estáticos Manrope foram instanciados deterministicamente, nos pesos 500/600/700, a partir desse mesmo arquivo variável e permanecem sob a OFL existente.

Execute `node check-fonts.mjs` neste diretório para validar assinatura, peso, permissão de incorporação e o eixo variável. O teste também confirma pelo SHA-256 que o WOFF2 Medium é exatamente o binário oficial usado no pacote.

Ao atualizar uma fonte, atualize também os blocos `@font-face` de `../design-tokens.css`, preserve os nomes de família, rode o teste acima e verifique novamente o bundle de design-sync e os SVGs.
