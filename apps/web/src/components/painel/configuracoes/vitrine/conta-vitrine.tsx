"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useRole } from "@/components/painel/role-provider";
import {
  limpaDepoisDeSalvar,
  mensagemDeSucesso,
  motivoDoBloqueio,
  podeSalvarCampo,
  type CampoDaConta,
} from "@/lib/painel/conta";

/**
 * A porta "Conta" na paleta da Vitrine.
 *
 * O bloco atravessou a migração inteiro porque a tela nova o recebe como prop
 * `conta` — aparecia dentro dela com a tipografia e as cores da casca antiga.
 *
 * Mesma copy e mesmos gates, com uma correção: o botão "Salvar" deixou de
 * ficar aceso com o campo vazio (ver `podeSalvarCampo`).
 */
export function ContaVitrine() {
  const router = useRouter();
  const toast = useToast();
  const { can } = useRole();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<CampoDaConta | null>(null);

  useEffect(() => {
    fetch("/api/auth/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (dados) {
          setNome(dados.name ?? "");
          setEmail(dados.email ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(campo: CampoDaConta) {
    const valor = campo === "name" ? nome : campo === "email" ? email : senha;
    if (!podeSalvarCampo(campo, valor)) return;

    setSalvando(campo);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.error || "Erro ao salvar.", "error");
        return;
      }
      toast(mensagemDeSucesso(campo));
      if (limpaDepoisDeSalvar(campo)) setSenha("");
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setSalvando(null);
    }
  }

  async function apagarConta() {
    const res = await fetch("/api/auth/account", { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Erro ao deletar.", "error");
      return;
    }
    router.replace("/login");
  }

  if (carregando) {
    return (
      <div className="space-y-3" role="status" aria-label="Carregando os dados da conta">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pn-skeleton h-14 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Linha campo="name" rotulo="Nome" valor={nome} aoMudar={setNome} salvando={salvando === "name"} aoSalvar={salvar} />
      <Linha campo="email" rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} salvando={salvando === "email"} aoSalvar={salvar} />
      <Linha
        campo="password"
        rotulo="Nova senha"
        tipo="password"
        valor={senha}
        aoMudar={setSenha}
        salvando={salvando === "password"}
        aoSalvar={salvar}
        dica="Mínimo 6 caracteres"
      />

      <div className="border-t border-line-200 pt-5">
        <button
          type="button"
          onClick={() => {
            void fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"));
          }}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
        >
          Sair da conta
        </button>
      </div>

      {/* Gate de papel: quem não pode apagar não vê o botão. */}
      {can("account:delete") && (
        <div className="border-t border-line-200 pt-5">
          {!confirmandoExclusao ? (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-danger-700 transition-colors hover:bg-canvas-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Deletar conta
            </button>
          ) : (
            <div className="pn-aviso rounded-[var(--radius-control)] p-4" role="alert">
              <p className="text-15 font-semibold text-danger-700">
                Tem certeza? Essa ação é irreversível. Todos os dados serão apagados.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void apagarConta()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-danger-700 px-4 text-15 font-semibold text-paper-0"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Sim, deletar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Linha({
  campo,
  rotulo,
  tipo = "text",
  valor,
  aoMudar,
  salvando,
  aoSalvar,
  dica,
}: {
  campo: CampoDaConta;
  rotulo: string;
  tipo?: string;
  valor: string;
  aoMudar: (v: string) => void;
  salvando: boolean;
  aoSalvar: (campo: CampoDaConta) => void;
  dica?: string;
}) {
  const pode = podeSalvarCampo(campo, valor);
  const motivo = motivoDoBloqueio(campo, valor);
  const idDoErro = `conta-erro-${campo}`;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-13 font-semibold text-volt-950" htmlFor={`conta-${campo}`}>
          {rotulo}
        </label>
        <input
          id={`conta-${campo}`}
          type={tipo}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={dica}
          aria-invalid={motivo !== null}
          aria-describedby={motivo ? idDoErro : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pode) aoSalvar(campo);
          }}
          className="min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-15 text-volt-950 outline-none transition-colors placeholder:text-slate-600 focus:border-cobalt-500"
        />
        {motivo && (
          <p id={idDoErro} className="mt-1 text-13 text-danger-700">
            {motivo}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => aoSalvar(campo)}
        disabled={salvando || !pode}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 text-15 font-semibold text-paper-0 transition-colors",
          salvando || !pode ? "cursor-not-allowed bg-volt-950/30" : "bg-volt-950 hover:bg-volt-800",
        )}
      >
        {salvando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        Salvar <span className="sr-only">{rotulo}</span>
      </button>
    </div>
  );
}
