import { DEMO_STEP_COUNT } from "./script";

/**
 * Validação do payload da captura de demonstração. Pura, sem `server-only`:
 * o handler de rota não roda sob `tsx --test`, então a regra mora aqui.
 */

const NAME_MAX = 120;

export type DemoRequestValue = {
  name: string;
  phone: string;
  stepReached: number | null;
};

export type DemoRequestValidation =
  | { ok: true; value: DemoRequestValue }
  | { ok: false; error: string };

/**
 * Devolve só os dígitos de um celular brasileiro, ou `null` se não for um.
 *
 * Exige o 9 do celular: o produto inteiro fala por WhatsApp, então um fixo aqui
 * é lead que nunca vai ser alcançado. DDD válido é 11-99.
 */
export function normalizePhoneBR(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length === 13 ? digits.slice(2) : digits;

  if (local.length !== 11) return null;
  if (local[2] !== "9") return null;

  const ddd = Number(local.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) return null;

  return local;
}

export function validateDemoRequest(body: unknown): DemoRequestValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Envio inválido." };
  }

  const raw = body as Record<string, unknown>;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, error: "Preencha seu nome." };
  if (name.length > NAME_MAX) return { ok: false, error: "Nome longo demais." };

  const phoneRaw = typeof raw.phone === "string" ? raw.phone : "";
  const phone = normalizePhoneBR(phoneRaw);
  if (!phone) return { ok: false, error: "Informe um celular com DDD e WhatsApp." };

  // Fora da faixa vira null em vez de erro: o passo é telemetria, não é o que a
  // pessoa preencheu. Recusar o lead por causa disso seria perder a venda por
  // um campo que ela nem viu.
  const step = raw.stepReached;
  const stepReached =
    typeof step === "number" && Number.isInteger(step) && step >= 0 && step < DEMO_STEP_COUNT
      ? step
      : null;

  return { ok: true, value: { name, phone, stepReached } };
}
