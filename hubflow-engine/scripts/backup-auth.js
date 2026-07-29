#!/usr/bin/env node
// Backup CIFRADO do estado sensível da engine:
//   - auth/            → credenciais da sessão WhatsApp do lojista (perder = reconectar por QR)
//   - engine-state.json → contador anti-ban + warmup (perder = warmup zera)
//
// Cifra com AES-256-GCM (chave derivada de BACKUP_PASSPHRASE via scrypt) e envia
// pro Supabase Storage via REST (mesmo padrão de auth do resto da engine — sem SDK,
// sem dep nova). Vazar o bucket NÃO expõe a sessão: sem a passphrase, é lixo cifrado.
//
// Uso:
//   node scripts/backup-auth.js                       → backup + upload + retenção
//   node scripts/backup-auth.js restore <arq|nome> [destDir]
//                                                     → baixa/decifra/extrai (default ./auth-restore)
//
// Roda como processo SEPARADO (cron). NÃO importa index.js — só LÊ os arquivos, então
// nunca interfere na engine rodando (engine-state.json é escrito atômico). Passphrase e
// service-role SÓ via env, nunca em log.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ENGINE_DIR = path.resolve(__dirname, "..");
const AUTH_DIR = path.join(ENGINE_DIR, "auth");
const STATE_FILE = process.env.ENGINE_STATE_FILE
  ? path.resolve(ENGINE_DIR, process.env.ENGINE_STATE_FILE)
  : path.join(ENGINE_DIR, "engine-state.json");
const BUCKET = process.env.BACKUP_BUCKET || "engine-backups";
const RETENTION = Number(process.env.BACKUP_RETENTION || 14);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} ausente — abortando (backup precisa dessa env). Nada foi enviado.`);
    process.exit(1);
  }
  return value;
}

const storageBase = () => `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/storage/v1`;
function authHeaders() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// === Cripto ===
// Layout do arquivo: MAGIC(8) | salt(16) | iv(12) | authTag(16) | ciphertext
const MAGIC = Buffer.from("HFENGBK1"); // HubFlow ENGine BacKup v1

function encrypt(plaintext, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), enc]);
}

function decrypt(buf, passphrase) {
  if (!buf.subarray(0, 8).equals(MAGIC)) throw new Error("arquivo não é um backup válido (magic)");
  const salt = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(36, 52);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(52)), decipher.final()]);
}

// === Supabase Storage (REST) ===
async function ensureBucket() {
  const res = await fetch(`${storageBase()}/bucket`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (res.ok || res.status === 409) return;
  const txt = await res.text().catch(() => "");
  if (/exist/i.test(txt)) return; // já existe → ok
  throw new Error(`falha ao garantir bucket (${res.status}): ${txt}`);
}

async function upload(name, buffer) {
  const res = await fetch(`${storageBase()}/object/${BUCKET}/${name}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/octet-stream", "x-upsert": "true" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`upload falhou (${res.status}): ${await res.text().catch(() => "")}`);
}

async function listBackups() {
  const res = await fetch(`${storageBase()}/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list falhou (${res.status})`);
  const items = await res.json();
  return items.map((i) => i.name).filter((n) => n.endsWith(".tar.gz.enc"));
}

async function remove(name) {
  await fetch(`${storageBase()}/object/${BUCKET}/${name}`, { method: "DELETE", headers: authHeaders() });
}

async function download(name) {
  const res = await fetch(`${storageBase()}/object/${BUCKET}/${name}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`download falhou (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// === Tar helpers ===
function makeTar() {
  const targets = [];
  if (fs.existsSync(AUTH_DIR)) targets.push("auth");
  if (fs.existsSync(STATE_FILE)) targets.push(path.basename(STATE_FILE));
  if (targets.length === 0) throw new Error("nada pra backupar (sem auth/ nem engine-state.json)");
  const tmp = path.join(os.tmpdir(), `hf-engine-backup-${Date.now()}.tar.gz`);
  execFileSync("tar", ["-czf", tmp, "-C", ENGINE_DIR, ...targets]);
  return tmp;
}

const stamp = () =>
  new Date().toISOString().replace("T", "-").replace(/:/g, "").replace(/\..+/, "");

// === Comandos ===
async function doBackup() {
  const passphrase = requireEnv("BACKUP_PASSPHRASE");
  await ensureBucket();
  const tarPath = makeTar();
  try {
    const enc = encrypt(fs.readFileSync(tarPath), passphrase);
    const name = `engine-auth-${stamp()}.tar.gz.enc`;
    await upload(name, enc);
    console.log(`✅ Backup enviado: ${BUCKET}/${name} (${enc.length} bytes)`);

    // Retenção: nomes são datados → ordem lexical = cronológica. Mantém os N mais novos.
    const all = (await listBackups()).sort();
    for (const old of all.slice(0, Math.max(0, all.length - RETENTION))) {
      await remove(old);
      console.log(`   ↳ removido (retenção ${RETENTION}): ${old}`);
    }
  } finally {
    fs.rmSync(tarPath, { force: true });
  }
}

async function doRestore(fileArg, destArg) {
  const passphrase = requireEnv("BACKUP_PASSPHRASE");
  if (!fileArg) {
    console.error("uso: node scripts/backup-auth.js restore <arquivo.enc | nome-no-bucket> [destDir]");
    process.exit(1);
  }
  const dest = path.resolve(destArg || path.join(ENGINE_DIR, "auth-restore"));
  const encBuf = fs.existsSync(fileArg) ? fs.readFileSync(fileArg) : await download(path.basename(fileArg));
  const tarBuf = decrypt(encBuf, passphrase); // falha aqui = passphrase errada ou arquivo corrompido
  const tmp = path.join(os.tmpdir(), `hf-engine-restore-${Date.now()}.tar.gz`);
  fs.writeFileSync(tmp, tarBuf);
  fs.mkdirSync(dest, { recursive: true });
  try {
    execFileSync("tar", ["-xzf", tmp, "-C", dest]);
    console.log(`✅ Restaurado em: ${dest}`);
    console.log(`   Próximo: PARE a engine, mova ${path.join(dest, "auth")} → auth/ e suba de novo.`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

(async () => {
  try {
    const [cmd, ...rest] = process.argv.slice(2);
    if (cmd === "restore") await doRestore(rest[0], rest[1]);
    else await doBackup();
  } catch (err) {
    console.error(`❌ Falhou: ${err.message}`);
    process.exit(1);
  }
})();
