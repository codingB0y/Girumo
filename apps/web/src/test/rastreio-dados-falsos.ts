/**
 * Dados de teste do Rastreio. O repositório é público: nada de documento,
 * telefone, e-mail ou nome de gente de verdade. CPF e CNPJ são gerados aqui,
 * com os dígitos verificadores calculados.
 */

function cpfDv(base: string): string {
  const soma = [...base].reduce((s, c, i) => s + Number(c) * (base.length + 1 - i), 0);
  return String(((soma * 10) % 11) % 10);
}

/** CPF válido a partir dos 9 dígitos de base. */
export function gerarCpf(base9: string): string {
  const com1 = base9 + cpfDv(base9);
  return com1 + cpfDv(com1);
}

function cnpjDv(base: string): string {
  const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * (((base.length - 1 - i) % 8) + 2), 0);
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** CNPJ válido (numérico ou alfanumérico) a partir dos 12 caracteres de base. */
export function gerarCnpj(base12: string): string {
  const com1 = base12 + cnpjDv(base12);
  return com1 + cnpjDv(com1);
}

export const PEDIDO_CPF = gerarCpf("123456789");

const brt = (d: string) => ({ date: `${d}.000000`, timezone_type: 3, timezone: "America/Sao_Paulo" });
const item = (alias: string, d: string) => ({ status: { data: { alias } }, created_at: brt(d) });

/** Pedido de `GET /orders?include=customer,status,statuses` da Yampi, de mentira. */
export function pedidoYampi(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 90001,
    number: 1042,
    created_at: brt("2026-10-27 10:15:00"),
    updated_at: brt("2026-10-29 09:30:00"),
    status: { data: { id: 7, alias: "on_carriage", name: "Em transporte" } },
    track_code: "QA123456789BR",
    track_url: "https://rastreio.exemplo/QA123456789BR",
    delivered: false,
    shipment_service: "PAC",
    customer: {
      data: {
        type: "f",
        name: "Maria Teste da Silva",
        email: "maria.teste@exemplo.com",
        cpf: "123.456.789-09",
        cnpj: null,
        phone: { area_code: "11", number: "987654321", full_number: "11987654321" },
      },
    },
    statuses: {
      data: [
        item("waiting_payment", "2026-10-27 10:15:00"),
        item("paid", "2026-10-27 10:20:00"),
        item("invoiced", "2026-10-28 08:00:00"),
        item("on_carriage", "2026-10-29 09:30:00"),
      ],
    },
    ...extra,
  };
}
