export function isCronAuthorized(header: string | null, secret: string): boolean {
  return secret.length >= 24 && header === `Bearer ${secret}`;
}
