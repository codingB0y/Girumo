"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { useRole } from "@/components/painel/role-provider";
import type { DnsRecord } from "@/lib/custom-domains/hostname";
import { textoDoProblema, type DominioView } from "@/lib/custom-domains/view";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Leitura = { habilitado: boolean; dominio: DominioView | null };
type Acao = "conectar" | "verificar" | "remover";

const INPUT =
  "min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-15 text-volt-950 outline-none transition-colors placeholder:text-slate-600 focus:border-cobalt-500";
const PRIMARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 text-15 font-semibold text-paper-0 transition-colors";
const SECUNDARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100";

async function erroDa(res: Response): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || "Não deu certo. Tente de novo.";
}

/** Valor de registro DNS com botão de copiar (o `CopyLink` prefixaria https://). */
function Copiavel({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard indisponível — o valor continua na tela para copiar à mão */
    }
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-data min-w-0 break-all text-13 text-volt-950">{valor}</span>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${rotulo}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-cobalt-500/10 hover:text-cobalt-500"
      >
        {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </span>
  );
}

function Registros({ registros }: { registros: DnsRecord[] }) {
  return (
    <table className="mt-4 w-full table-fixed border-collapse text-left">
      <thead>
        <tr className="text-12 text-slate-600">
          <th scope="col" className="w-20 pb-2 font-normal">Tipo</th>
          <th scope="col" className="pb-2 font-normal">Nome</th>
          <th scope="col" className="pb-2 font-normal">Valor</th>
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={`${r.tipo}-${r.nome}`} className="border-t border-line-200 align-top">
            <td className="font-data py-3 text-13 text-volt-950">{r.tipo}</td>
            <td className="py-3 pr-3"><Copiavel valor={r.nome} rotulo={`nome do registro ${r.tipo}`} /></td>
            <td className="py-3"><Copiavel valor={r.valor} rotulo={`valor do registro ${r.tipo}`} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Cartão "Domínio próprio" da aba Conexão: o lojista liga um subdomínio dele
 * aos links de grupo. Some inteiro enquanto a integração com a Vercel não está
 * configurada no servidor (`habilitado: false`).
 */
export function DominioProprio() {
  const toast = useToast();
  const { can } = useRole();
  const podeEditar = can("settings:connection");
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [host, setHost] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [desafios, setDesafios] = useState<DnsRecord[]>([]);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    authenticatedFetch("/api/dominio")
      .then((res) => (res.ok ? (res.json() as Promise<Leitura>) : Promise.reject(new Error(String(res.status)))))
      .then(setLeitura)
      .catch(() => setFalhou(true));
  }, []);

  function trocar(dominio: DominioView | null) {
    setLeitura({ habilitado: true, dominio });
  }

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAcao("conectar");
    try {
      const res = await authenticatedFetch("/api/dominio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: host }),
      });
      if (!res.ok) return setErro(await erroDa(res));
      trocar(((await res.json()) as { dominio: DominioView }).dominio);
      setHost("");
      toast("Domínio cadastrado. Agora crie os dois registros abaixo no seu provedor.");
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setAcao(null);
    }
  }

  async function verificar() {
    setAcao("verificar");
    try {
      const res = await authenticatedFetch("/api/dominio/verificar", { method: "POST" });
      if (!res.ok) return toast(await erroDa(res), "error");
      const corpo = (await res.json()) as { dominio: DominioView; desafios: DnsRecord[] };
      trocar(corpo.dominio);
      setDesafios(corpo.desafios);
      if (corpo.dominio.status === "active") toast("Domínio ativo. Os links já saem com o seu endereço.");
      else toast(textoDoProblema(corpo.dominio.problema) ?? "Ainda não ficou pronto. Tente de novo em alguns minutos.", "error");
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setAcao(null);
    }
  }

  async function remover() {
    setAcao("remover");
    try {
      const res = await authenticatedFetch("/api/dominio", { method: "DELETE" });
      if (!res.ok) return toast(await erroDa(res), "error");
      trocar(null);
      setDesafios([]);
      setConfirmando(false);
      toast("Domínio removido. Links novos voltam a sair com o endereço do Girumo.");
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setAcao(null);
    }
  }

  if (falhou) {
    return (
      <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-dominio">
        <h2 className="text-[18px] font-semibold text-volt-950">Domínio próprio</h2>
        <p className="mt-2 text-13 text-slate-600">Não conseguimos carregar o domínio agora.</p>
      </section>
    );
  }
  if (!leitura) {
    return (
      <div
        className="pn-skeleton h-32 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando o domínio próprio"
      />
    );
  }
  if (!leitura.habilitado) return null;

  const { dominio } = leitura;
  const ativo = dominio?.status === "active";
  const problema = dominio && !ativo ? textoDoProblema(dominio.problema) : null;

  return (
    <section
      className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8"
      data-testid="configuracoes-dominio"
      aria-labelledby="dominio-proprio-titulo"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="dominio-proprio-titulo" className="text-[18px] font-semibold text-volt-950">
          Domínio próprio
        </h2>
        {dominio && (
          <span className={cn("pn-chip", ativo ? "text-success-700" : "text-slate-600")} data-testid="dominio-etiqueta">
            {ativo ? "Ativo" : "Aguardando DNS"}
          </span>
        )}
      </div>

      {!dominio && (
        <>
          <p className="mt-2 text-13 text-slate-600">
            Os links dos seus grupos saem no seu endereço: <span className="font-data">links.sualoja.com.br/vip</span>{" "}
            em vez do endereço do Girumo.
          </p>
          {podeEditar && (
            <form onSubmit={conectar} className="mt-5 flex flex-wrap items-start gap-3" noValidate>
              <div className="min-w-[240px] flex-1">
                <label htmlFor="dominio-proprio-host" className="mb-1.5 block text-13 font-semibold text-volt-950">
                  Subdomínio da loja
                </label>
                <input
                  id="dominio-proprio-host"
                  className={INPUT}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="links.sualoja.com.br"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? "dominio-proprio-erro" : undefined}
                />
                {erro && (
                  <p id="dominio-proprio-erro" role="alert" className="mt-1 text-13 text-danger-700">
                    {erro}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={acao !== null || !host.trim()}
                className={cn(
                  PRIMARIO,
                  "mt-6",
                  acao !== null || !host.trim() ? "cursor-not-allowed bg-volt-950/30" : "bg-volt-950 hover:bg-volt-800",
                )}
              >
                {acao === "conectar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Conectar
              </button>
            </form>
          )}
        </>
      )}

      {dominio && (
        <>
          <p className="font-data mt-3 break-all text-[20px] text-volt-950">{dominio.hostname}</p>
          {ativo ? (
            <p className="mt-2 text-13 text-slate-600">
              Seus links de campanha já saem assim: <span className="font-data">https://{dominio.hostname}/…</span>
            </p>
          ) : (
            <>
              <p className="mt-2 text-13 text-slate-600">
                No painel do seu provedor de domínio, crie os dois registros abaixo. Alguns provedores pedem só a parte
                do nome antes do seu domínio (por exemplo, só <span className="font-data">links</span>).
              </p>
              <Registros registros={dominio.registros} />
              {desafios.length > 0 && <Registros registros={desafios} />}
              {problema && (
                <p role="status" className="pn-aviso mt-4 rounded-[var(--radius-control)] p-4 text-13 text-volt-950">
                  {problema}
                </p>
              )}
            </>
          )}

          {podeEditar && (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-200 pt-5">
              {!ativo && (
                <button
                  type="button"
                  onClick={verificar}
                  disabled={acao !== null}
                  className={cn(PRIMARIO, acao !== null ? "cursor-not-allowed bg-volt-950/30" : "bg-volt-950 hover:bg-volt-800")}
                >
                  {acao === "verificar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Verificar agora
                </button>
              )}
              {confirmando ? (
                <>
                  <p role="alert" className="w-full text-13 text-danger-700">
                    Os links que já estão com o seu endereço (grupos, anúncios, QR impresso) vão parar de abrir.
                  </p>
                  <button type="button" onClick={remover} disabled={acao !== null} className={cn(SECUNDARIO, "text-danger-700")}>
                    {acao === "remover" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Confirmar remoção
                  </button>
                  <button type="button" onClick={() => setConfirmando(false)} className={SECUNDARIO}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmando(true)} disabled={acao !== null} className={SECUNDARIO}>
                  Remover
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
