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

module.exports = {
  requireEnv,
  optionalEnv,
  hasSupabaseEngineConfig,
};

