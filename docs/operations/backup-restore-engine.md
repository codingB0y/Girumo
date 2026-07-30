# Runbook — Backup & Restore da engine WhatsApp

Protege o estado sensível da engine:

- **`auth/`** — credenciais da sessão WhatsApp do lojista. Perder = reconectar por QR.
- **`engine-state.json`** — contador anti-ban + fase do warmup. Perder = warmup zera (risco de estourar limite).

Script: [`hubflow-engine/scripts/backup-auth.js`](../../hubflow-engine/scripts/backup-auth.js). Cifra com **AES-256-GCM** (chave derivada da `BACKUP_PASSPHRASE` via scrypt) e envia pro **Supabase Storage** (bucket privado, via REST — sem SDK). Vazar o bucket **não** expõe a sessão: sem a passphrase, é lixo cifrado.

## Envs necessárias

| Env | Obrigatória | Descrição |
|---|---|---|
| `BACKUP_PASSPHRASE` | ✅ | Passphrase forte p/ cifrar/decifrar. **Guarde FORA do Supabase** (senão vazamento do bucket + passphrase = sequestro da conta). Se perder a passphrase, os backups são irrecuperáveis. |
| `SUPABASE_URL` | ✅ | Já usada pela engine. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Já usada pela engine. |
| `BACKUP_BUCKET` | ❌ | Default `engine-backups`. Criado automaticamente (privado) no 1º run. |
| `BACKUP_RETENTION` | ❌ | Default `14` (mantém os 14 backups mais novos, apaga o resto). |

## Backup (o que o cron roda)

```bash
cd hubflow-engine && node scripts/backup-auth.js
```

Gera `engine-auth-<timestamp>.tar.gz.enc` no bucket e aplica a retenção. Idempotente e seguro rodar com a engine no ar (só lê os arquivos).

### Agendar no Coolify (cron diário)

Adicione um **Scheduled Task** no serviço da engine (ou um cron no host) com horário fora do minuto cheio p/ não competir com outros jobs:

```
17 3 * * *  cd /app && node scripts/backup-auth.js >> /var/log/engine-backup.log 2>&1
```

(`/app` = WORKDIR do container; ajuste se diferente.)

## Restore

> ⚠️ Restaurar **sobrescreve a sessão atual**. Faça só quando a sessão local estiver perdida/corrompida.

```bash
cd hubflow-engine

# 1. (se o arquivo não estiver local) baixe+decifre+extraia um backup do bucket:
node scripts/backup-auth.js restore engine-auth-2026-07-29-031700.tar.gz.enc
#    → extrai em ./auth-restore/  (auth/ + engine-state.json)

# 2. PARE a engine (Coolify: stop; ou Ctrl+C / docker stop)

# 3. Troque a sessão:
mv auth auth.bak && mv auth-restore/auth auth
mv auth-restore/engine-state.json engine-state.json   # se quiser restaurar o contador também

# 4. Suba a engine de novo. NÃO deve pedir QR (sessão restaurada).
```

Passphrase errada ou arquivo corrompido → o passo 1 falha no decifrar (GCM detecta adulteração), sem gerar arquivo parcial.

## ⬜ TODO — testar o restore 1× (obrigatório antes de confiar)

Backup sem restore testado é falsa segurança. Uma vez, num **número secundário**:

1. Rode um backup.
2. `node scripts/backup-auth.js restore <nome-no-bucket> /tmp/restore-test` e confirme que `/tmp/restore-test/auth/` tem os arquivos de credencial (`creds.json` etc.).
3. Anote aqui que passou: `Restore testado em ____/____/____ ✅`.
