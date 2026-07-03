export function resolveSecret(
  name: string,
  value: string | undefined,
  environment: string | undefined,
  devDefault: string,
): string {
  if (value?.trim()) return value.trim();
  if (environment === "production") {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return devDefault;
}
