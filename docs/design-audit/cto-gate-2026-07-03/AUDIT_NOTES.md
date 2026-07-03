# Evidências UX — CTO Gate Review

Data: 2026-07-03  
Superfície: aquisição pública, autenticação e bloqueio de rota protegida.  
Ambiente: build de produção servido localmente, viewport desktop 1280×720 e mobile 390×844.

## Passos capturados

1. `01-landing-viewport.png` — landing desktop — **Aceitável**
   - Força: proposta de valor e dois caminhos de conversão ficam claros no primeiro viewport.
   - Risco: o CTA fixo e o CTA do hero duplicam a mesma decisão; o banner de desenvolvimento sobrepõe a navegação no ambiente local.

2. `02-login.png` — login desktop — **Aprovado**
   - Força: hierarquia, labels, recuperação de senha e login Google são claros.
   - Risco: textos secundários e a mensagem de proteção têm contraste visual baixo.

3. `03-signup.png` — cadastro desktop — **Aceitável**
   - Força: progresso em três etapas reduz incerteza e a promessa de trial está visível.
   - Risco: o formulário ultrapassa o primeiro viewport; conteúdo de confiança fica parcialmente abaixo da dobra.

4. `04-painel-login-wall.png` — acesso anônimo a `/painel` — **Aprovado**
   - O redirecionamento preserva `next=/painel` e explica que o usuário voltará ao painel após entrar.

5. `05-landing-mobile.png` — landing mobile — **Aceitável**
   - Força: headline, prova e ações refluem corretamente.
   - Risco: o CTA fixo consome uma faixa relevante da altura útil e repete as ações já presentes no hero.

6. `06-signup-mobile.png` — cadastro mobile — **Aceitável**
   - Força: campos e botões têm alvos grandes e sequência previsível.
   - Risco: fluxo vertical longo; textos auxiliares pequenos e de baixo contraste merecem medição WCAG.

## Limites da evidência

- O painel autenticado não foi auditado por falta de uma sessão de teste fornecida para esta revisão.
- As capturas permitem apontar riscos de contraste e reflow, mas não comprovam conformidade WCAG.
- Navegação por teclado, foco, leitores de tela, mensagens de erro e estados de carregamento exigem teste interativo dedicado.
- O banner verde é exclusivo do modo local; não foi tratado como defeito de produção, apenas como atrito no ambiente de desenvolvimento.
