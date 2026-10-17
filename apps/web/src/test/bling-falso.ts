/**
 * O mundo do motor do Bling em memória, para os testes de `processar-pedido` e `sincronizar`.
 *
 * Stores falsas com as regras do banco (`bling-falso-stores.ts`), o Bling por um fetch falso
 * roteado pela URL (`bling-falso-remoto.ts`), o Meta que só guarda o que receberia, e um relógio
 * que só anda quando alguém espera — o ritmo de 350 ms do cliente e os recuos andam com ele, então
 * o orçamento de uma execução acaba de verdade. Toda chamada às stores, ao Meta e à projeção entra
 * na `trilha`, na ordem; o `gancho` vê cada entrada.
 */
import { avisarReconectar } from "@/lib/bling/avisar-reconectar";
import { criarClienteBling, type ClienteBling } from "@/lib/bling/cliente";
import type { DepsBling } from "@/lib/bling/deps";
import { renovarToken } from "@/lib/bling/oauth";
import { chaveDoTelefone } from "@/lib/pages/phone";
import type { ConexaoBling } from "@/lib/stores/bling-conexoes";

import {
  AGORA,
  CHAVE,
  conexaoPadrao,
  daLoja,
  iso,
  LEAD_MARIA,
  MARIA,
  PIXEL,
  registrar,
  SITUACOES,
  campanha,
  type Estado,
} from "./bling-falso-base";
import { fetchDoBling } from "./bling-falso-remoto";
import {
  avisoFalso,
  conexoesFalsas,
  contatosFalsos,
  enfileirarUm,
  pedidosFalsos,
  projetarFalso,
  reabrirDesde,
  ultimoCadastro,
} from "./bling-falso-stores";

export * from "./bling-falso-base";
export { alterados, listaPorAlteracao } from "./bling-falso-remoto";

export type BlingFalso = Estado & { deps: DepsBling; cliente: (prazo?: number) => ClienteBling };

export function criarBlingFalso(): BlingFalso {
  const e = estadoInicial();
  const deps = depsFalsas(e);
  return Object.assign(e, { deps, cliente: (prazo?: number) => clienteDeTeste(e, deps, prazo) });
}

export function ajustarConexao(f: { conexao: ConexaoBling | null }, extra: Partial<ConexaoBling>): void {
  if (!f.conexao) throw new Error("bling-falso: loja sem conexão");
  f.conexao = { ...f.conexao, ...extra };
}

/** O Salvar do cartão, como o PATCH dos ajustes: grava o ajuste e só depois reabre os pedidos desde `dia`. */
export function salvarNoCartao(f: BlingFalso, ajuste: Partial<ConexaoBling>, dia: string): void {
  ajustarConexao(f, ajuste);
  reabrirDesde(f, dia);
}

/** O aviso do Bling chegando para o pedido: a mesma regra do `bling_enqueue('aviso')`. */
export function avisar(f: BlingFalso, id: number): void {
  enfileirarUm(f, "aviso", { id });
}

export const chamadasDoBling = (f: BlingFalso, caminho: string) => f.bling.chamadas.filter((c) => c.caminho === caminho);
export const pendentes = (f: BlingFalso) => [...f.pedidos.values()].filter((l) => l.pending);
export const foraDaFila = (f: BlingFalso, ids: Iterable<number>) => [...ids].filter((id) => !f.pedidos.has(id));
/** Os GETs da varredura (a listagem por data de alteração), na ordem. */
export const varreduras = (f: BlingFalso) => chamadasDoBling(f, "/pedidos/vendas").filter((c) => c.query.has("dataAlteracaoInicial"));

/** As fatias lidas, em ordem, como "início → fim: páginas" (o filtro que foi ao Bling, em hora de São Paulo). */
export function fatiasLidas(f: BlingFalso): string[] {
  const fatias = varreduras(f).reduce<Array<{ janela: string; paginas: number }>>((lidas, c) => {
    const janela = `${c.query.get("dataAlteracaoInicial")} → ${c.query.get("dataAlteracaoFinal")}`;
    const ultima = lidas.at(-1);
    const continua = ultima?.janela === janela && Number(c.query.get("pagina")) === ultima.paginas + 1;
    return continua ? [...lidas.slice(0, -1), { janela, paginas: ultima.paginas + 1 }] : [...lidas, { janela, paginas: 1 }];
  }, []);
  return fatias.map((x) => `${x.janela}: ${x.paginas}`);
}

/** Troca a resposta da listagem quando `resposta(query)` devolve uma; a chamada fica registrada no Bling falso. */
export function trocarListagem(f: BlingFalso, resposta: (q: URLSearchParams) => Response | null): void {
  const normal = f.deps.fetchImpl;
  f.deps.fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const original = await normal(entrada, init);
    const url = new URL(String(entrada));
    return (url.pathname.endsWith("/pedidos/vendas") && resposta(url.searchParams)) || original;
  }) as typeof fetch;
}

/**
 * Cada GET da listagem leva `ms` no relógio falso (o Bling de verdade responde em centenas de ms). Como no
 * fetch de verdade, a que passaria do timeout dela é abortada nele: o relógio anda só até lá. Devolve o
 * timeout de cada GET da listagem, na ordem.
 */
export function comLatencia(f: BlingFalso, ms: number): number[] {
  vigiarTimeouts();
  const tempos: number[] = [];
  const normal = f.deps.fetchImpl;
  f.deps.fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const r = await normal(entrada, init);
    if (!new URL(String(entrada)).pathname.endsWith("/pedidos/vendas")) return r;
    const timeout = init?.signal ? timeouts.get(init.signal) : undefined;
    if (timeout) tempos.push(timeout.ms);
    if (!timeout || ms <= timeout.ms) {
      f.agora += ms;
      return r;
    }
    f.agora += timeout.ms;
    throw timeout.abortar();
  }) as typeof fetch;
  return tempos;
}

/** O timeout de cada sinal do `AbortSignal.timeout`, e como dispará-lo já: no relógio falso o timer de verdade não chega. */
const timeouts = new WeakMap<AbortSignal, { ms: number; abortar: () => unknown }>();
let timeoutsVigiados = false;

/** Uma vez por processo: cada `AbortSignal.timeout` fica registrado e abortável (e segue disparando no tempo de verdade). */
function vigiarTimeouts(): void {
  if (timeoutsVigiados) return;
  timeoutsVigiados = true;
  const original = AbortSignal.timeout.bind(AbortSignal);
  AbortSignal.timeout = (ms: number) => {
    const controle = new AbortController();
    const sinal = AbortSignal.any([original(ms), controle.signal]);
    const abortar = () => {
      controle.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      return sinal.reason;
    };
    timeouts.set(sinal, { ms, abortar });
    return sinal;
  };
}

/** As linhas de log do motor (warn e error) guardadas em vez de impressas; `restaurar` devolve o console. */
export function capturarLogs(): { linhas: string[]; restaurar: () => void } {
  const [aviso, erro] = [console.warn, console.error];
  const linhas: string[] = [];
  console.warn = (...args: unknown[]) => void linhas.push(args.map(String).join(" "));
  console.error = console.warn;
  return {
    linhas,
    restaurar: () => {
      [console.warn, console.error] = [aviso, erro];
    },
  };
}

/** O motor loga cada erro do Bling de propósito; no teste o log só polui a saída. */
export function semLog(): () => void {
  return capturarLogs().restaurar;
}

function estadoInicial(): Estado {
  return {
    agora: AGORA,
    conexao: conexaoPadrao(),
    trava: null,
    pedidos: new Map(),
    contatos: new Map(),
    girumo: new Map(),
    leads: [LEAD_MARIA],
    cadastros: [],
    campanhas: [campanha("camp-1", PIXEL)],
    optouts: [],
    meta: { enviados: [], resposta: { ok: true } },
    credenciais: { clientId: "app-girumo", clientSecret: "segredo-do-app" },
    chave: CHAVE,
    limiteToken: false,
    emails: [],
    atualizacoes: [],
    trilha: [],
    gancho: null,
    bling: {
      chamadas: [],
      pedidos: new Map(),
      contatos: new Map([[MARIA.id, MARIA]]),
      situacoes: SITUACOES.map((s) => ({ ...s })),
      paginas: () => [],
      forcadas: [],
      aceitos: new Set(["access-1"]),
      refreshValido: "refresh-1",
      emitidos: 0,
      recusaTudo: false,
      oauth: null,
    },
    contadores: { versoes: 0, donos: 0, pedidosGirumo: 0 },
  };
}

/** Cliente para chamar `processarPedido` direto: token fixo, sem renovação (quem renova é o motor). */
function clienteDeTeste(e: Estado, deps: DepsBling, prazo?: number): ClienteBling {
  return criarClienteBling({
    token: async () => "access-1",
    renovar: async () => {
      throw new Error("bling-falso: renovação só pelo motor");
    },
    fetchImpl: deps.fetchImpl,
    esperar: deps.esperar,
    agora: () => e.agora,
    prazo,
  });
}

function depsFalsas(e: Estado): DepsBling {
  return {
    agora: () => new Date(e.agora),
    esperar: async (ms) => {
      e.agora += ms;
    },
    novoId: () => `dono-${(e.contadores.donos += 1)}`,
    fetchImpl: fetchDoBling(e),
    conexoes: conexoesFalsas(e),
    pedidos: pedidosFalsos(e),
    contatos: contatosFalsos(e),
    ...funilFalso(e),
    // A renovação de verdade, contra o /oauth/token do Bling falso.
    oauth: { renovar: renovarToken, credenciais: () => e.credenciais },
    cifra: { chave: () => e.chave },
    limiteTokenGlobal: async () => {
      registrar(e, "limiteTokenGlobal");
      return e.limiteToken;
    },
    avisarReconectar: (t) => avisarReconectar(t, avisoFalso(e)),
  };
}

/** Lead, cadastro do site, campanhas, descadastro, projeção em `orders` e Meta: só registram e respondem do estado. */
function funilFalso(e: Estado): Pick<DepsBling, "leads" | "cadastros" | "campanhas" | "optouts" | "projetar" | "meta"> {
  return {
    leads: {
      porTelefones: async (t, telefones) => {
        daLoja(t);
        registrar(e, "leads.porTelefones");
        return e.leads.find((l) => l.phone !== null && telefones.includes(l.phone)) ?? null;
      },
    },
    cadastros: {
      ultimoDaChave: async (t, chave, ate) => {
        daLoja(t);
        registrar(e, `cadastros.ultimoDaChave ${iso(ate.getTime())}`);
        return ultimoCadastro(e, chave, ate.getTime());
      },
    },
    campanhas: {
      comMetadata: async (t) => {
        daLoja(t);
        registrar(e, "campanhas.comMetadata");
        return structuredClone(e.campanhas);
      },
    },
    optouts: {
      // A mesma chave da store: o telefone em qualquer formato vira DDD + 8 últimos.
      chaves: async (t) => {
        daLoja(t);
        registrar(e, "optouts.chaves");
        return new Set(e.optouts.flatMap((tel) => chaveDoTelefone(tel) ?? []));
      },
    },
    projetar: async (t, p) => {
      daLoja(t);
      registrar(e, `projetar ${p.tipo}`);
      return projetarFalso(e, t, p);
    },
    meta: {
      enviar: async (a) => {
        e.meta.enviados.push(structuredClone(a));
        registrar(e, "meta.enviar");
        const { ok, error, raw } = e.meta.resposta;
        return ok ? { ok: true, eventsReceived: a.payload.data.length } : { ok: false, error, ...(raw ? { raw } : {}) };
      },
    },
  };
}
