function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  return value;
}

function optionalEnv(name) {
  return process.env[name] || null;
}

function hasSupabaseEngineConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Retorna o modo atual da engine: "mock" | "development" | "staging" | "production"
 */
function getEngineMode() {
  return process.env.ENGINE_MODE || (process.env.NODE_ENV === "production" ? "production" : "development");
}

/**
 * True se engine está em modo mock (não conecta WhatsApp real)
 */
function isMockMode() {
  return getEngineMode() === "mock";
}

/**
 * True se engine está em produção
 */
function isProductionEngine() {
  return getEngineMode() === "production";
}

/**
 * Guard: bloqueia ações perigosas se não estiver em produção.
 * Impede que dev/mock tente conectar com tokens reais.
 */
function blockProductionInDev(action) {
  if (isMockMode() || getEngineMode() === "development") {
    // Verifica se há tokens/URLs de produção
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const engineToken = process.env.ENGINE_TOKEN || "";

    // Se tem referências a produção, bloqueia
    if (supabaseUrl.includes("prod") || engineToken.startsWith("prod_")) {
      throw new Error(
        `[SECURITY] Engine em modo ${getEngineMode()} tentou executar "${action}" ` +
        `com credenciais que parecem ser de produção. Bloqueado.`
      );
    }
  }
}

/**
 * Valida ambiente da engine na inicialização.
 * Retorna objeto com status.
 */
function validateEngineEnvironment() {
  const mode = getEngineMode();
  const errors = [];
  const warnings = [];

  // Em modo mock, não precisa de Supabase nem Baileys config
  if (isMockMode()) {
    console.log("\n🧪 ENGINE MODE: MOCK (nenhuma conexão real)");
    return { valid: true, mode, errors, warnings };
  }

  // Em dev/staging, alerta se não tem Supabase
  if (!hasSupabaseEngineConfig()) {
    warnings.push("Supabase não configurado — command worker desabilitado");
  }

  // Em produção, exige tudo
  if (isProductionEngine()) {
    if (!process.env.ENGINE_TOKEN) errors.push("ENGINE_TOKEN obrigatório em produção");
    if (!hasSupabaseEngineConfig()) errors.push("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios em produção");
  }

  return { valid: errors.length === 0, mode, errors, warnings };
}

module.exports = {
  requireEnv,
  optionalEnv,
  hasSupabaseEngineConfig,
  getEngineMode,
  isMockMode,
  isProductionEngine,
  blockProductionInDev,
  validateEngineEnvironment,
};
