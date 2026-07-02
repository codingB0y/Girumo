# LOCAL_TESTING.md — Guia de Testes Locais

> Como testar cada funcionalidade do HubFlow no ambiente DEV isolado.

---

## Validação de Isolamento

Antes de testar qualquer coisa, confirme que o ambiente está isolado:

```bash
curl http://localhost:3000/api/admin/dev-tools/security-check | jq .
```

**Esperado:** `"isolated": true` e zero violations.

---

## 1. Login e Auth

### Testar login do admin

```bash
# Via interface
# 1. Abra http://localhost:3000/login
# 2. Use: admin@localhost.dev / DevOnly123!
# 3. Deve redirecionar para /painel
# 4. Banner verde "LOCAL DEV MODE" deve aparecer
```

### Testar login de operador

```bash
# 1. Logout do admin
# 2. Login com: operador@dev.local / DevUser123!
# 3. Deve ter acesso limitado (sem admin tools)
```

### Testar permissões

| Ação | Admin | Operator | Esperado |
|------|-------|----------|----------|
| Ver dashboard | ✅ | ✅ | OK |
| Dev Tools | ✅ | ❌ | 403 |
| Impersonate | ✅ | ❌ | 403 |
| Configurações | ✅ | ✅ | OK |
| Billing | ✅ | ❌ | 403 |

---

## 2. Multi-Tenant

### Switch Tenant

1. Login como admin
2. No banner verde, clique em "Tenant: ..."
3. Troque para `tenant-demo`
4. Verifique que dados mudaram
5. Troque para `tenant-stress`
6. Verifique isolamento (dados são diferentes)

### Criar novo tenant

```bash
curl -X POST http://localhost:3000/api/admin/tenants/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Tenant Teste", "slug": "tenant-teste"}'
```

---

## 3. Engine WhatsApp (Mock)

### Verificar que engine está rodando

```bash
curl http://localhost:3001/health
# Esperado: { "ok": true, "mode": "mock" }
```

### Simular envio de mensagem

```bash
curl -X POST http://localhost:3001/dev/send \
  -H "Content-Type: application/json" \
  -d '{"to": "5511999990000", "text": "Teste local!"}'
```

### Simular recebimento de mensagem

```bash
curl -X POST http://localhost:3001/dev/receive \
  -H "Content-Type: application/json" \
  -d '{"from": "5511888880000", "text": "Oi, quero saber mais"}'
```

### Ver log de mensagens

```bash
curl http://localhost:3001/dev/logs | jq .
```

### Criar sessão mock

```bash
curl -X POST http://localhost:3001/dev/sessions/minha-sessao
```

### Resetar engine

```bash
curl -X POST http://localhost:3001/dev/reset
```

---

## 4. Campanhas e Disparos

### Testar fluxo completo

1. Login como admin → tenant-dev
2. Ir para `/painel/campanhas`
3. Criar nova campanha
4. Selecionar contatos/grupo
5. Enviar (vai para engine mock)
6. Verificar log: `curl http://localhost:3001/dev/logs`

> Nenhuma mensagem real é enviada. Tudo fica no log local.

---

## 5. Stripe / Billing

### Simular checkout

1. Ir para configurações → planos
2. Selecionar upgrade de plano
3. Usar cartão de teste: `4242 4242 4242 4242`
4. Confirmar pagamento

### Simular falha de pagamento

Cartão que falha: `4000 0000 0000 0002`

### Simular webhook

```bash
curl -X POST http://localhost:3000/api/admin/dev-tools/simulate-webhook
```

---

## 6. Developer Tools

### Acessar painel

`http://localhost:3000/painel/dev-tools`

### Ações disponíveis

| Ação | O que faz |
|------|-----------|
| Popular Banco | Executa dev seed completo |
| Seed Completo | 8 tenants + dados realistas |
| Reset Dados | Limpa todas as tabelas |
| Simular Webhook | Webhook Stripe fake |
| Simular Ban | Desconexão por ban mock |
| Simular Falha | Testa comportamento offline |
| Limpar Sessões | Reset da engine mock |
| Engine Health | Verifica se engine responde |

---

## 7. Cenários de Teste

### Cenário: Novo cliente se cadastra

1. Reset banco: Dev Tools → Reset Dados
2. Rodar seed mínimo: Dev Tools → Popular Banco
3. Fazer signup como novo usuário
4. Conectar WhatsApp (mock)
5. Criar primeira campanha
6. Verificar que mensagens foram "enviadas" (mock)

### Cenário: Ban no WhatsApp

1. Dev Tools → Simular Ban
2. Verificar comportamento do painel
3. Verificar logs
4. Testar reconexão

### Cenário: Falha de pagamento

1. Dev Tools → Simular Webhook (payment_failed)
2. Verificar que tenant muda para "past_due"
3. Verificar restrições de acesso

### Cenário: Stress test

1. Trocar para `tenant-stress`
2. Popular com muitos dados
3. Testar performance da listagem
4. Verificar paginação

### Cenário: Engine offline

1. Parar engine: `Ctrl+C` no terminal da engine
2. Tentar enviar campanha
3. Verificar que UI trata erro gracefully
4. Dev Tools → Simular Falha
5. Reiniciar engine: `npm run dev`

---

## 8. Checklist de Validação

Antes de considerar o ambiente OK, valide:

- [ ] `security-check` retorna `isolated: true`
- [ ] Login funciona com admin DEV
- [ ] Banner verde aparece no topo
- [ ] Switch tenant funciona
- [ ] Engine mock responde em `/health`
- [ ] Mensagens vão para o log (não saem do mock)
- [ ] Stripe usa `sk_test_` (não `sk_live_`)
- [ ] Dev Tools acessível em `/painel/dev-tools`
- [ ] Reset + Seed funciona sem erros
- [ ] Nenhuma conexão com produção detectada

---

## 9. O que NÃO fazer

❌ Copiar `.env` de produção para local  
❌ Usar chaves `sk_live_` ou `pk_live_`  
❌ Conectar Supabase de produção  
❌ Usar sessões WhatsApp reais  
❌ Testar com dados de clientes reais  
❌ Rodar seed em produção  
❌ Usar domínio `app.hubflow.com.br` local  

---

## 10. Relatório de Teste

Após validar tudo, gere o relatório:

```bash
# Security check
curl -s http://localhost:3000/api/admin/dev-tools/security-check | jq .

# Engine status
curl -s http://localhost:3001/health | jq .

# Engine logs
curl -s http://localhost:3001/dev/logs | jq '.sessions'
```

Salve o output como evidência de que o ambiente está:
- ✅ Isolado
- ✅ Funcional
- ✅ Seguro
