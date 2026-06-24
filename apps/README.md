# Apps

Aplicacoes do HUBFLOW.

## Estrutura alvo

```txt
apps/
  web/
```

Durante a migracao, o app atual continua em `hubflow-groups`. A movimentacao para `apps/web` deve acontecer em uma etapa controlada, com validacao de build e sem misturar com mudancas de banco, auth ou engine.

