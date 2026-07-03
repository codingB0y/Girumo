export function resolveSecret(
  name: string,
  value: string | undefined,
  environment: string | undefined,
  devDefault: string,
): string {
  if (value?.trim()) return value.trim();
  // `next build` roda SEMPRE com NODE_ENV=production, mas nessa fase nenhum secret
  // é realmente usado (não há request sendo servida). Falhar aqui quebraria o build
  // inteiro só porque uma env não está presente no ambiente de build. Em runtime real
  // (sem a fase de build) a exigência de produção continua valendo.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (environment === "production" && !isBuildPhase) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return devDefault;
}
