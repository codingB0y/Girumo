"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";

const ERROS: Record<string, string> = {
  estado: "A conexão demorou demais. Tente de novo.",
  cancelado: "Você cancelou a conexão.",
  conta: "Não achei a conta do Instagram que você autorizou. Tente de novo.",
  outra_loja: "Esta conta do Instagram já está conectada em outra loja.",
  permissao: "Seu acesso nesta loja não permite conectar o Instagram.",
  zernio: "A Zernio não respondeu. Tente de novo.",
};

function textoDaConta(account: { username: string; status: string } | null): string {
  if (!account) return "Nenhuma conta do Instagram conectada ainda.";
  if (account.status === "active") return `@${account.username} conectada.`;
  if (account.status === "disconnected") return `@${account.username} foi desconectada.`;
  return `A conexão com @${account.username} caiu. Conecte de novo.`;
}

/** Estado da conta e os botões "Conectar Instagram" / "Desconectar". Lê `conectado`/`erro` da volta do callback uma vez e limpa a URL. */
export function ContaDoInstagram() {
  const { instagram, recarregarInstagram } = useCasca();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [ocupado, setOcupado] = useState(false);

  const conectado = params.get("conectado");
  const erro = params.get("erro");
  useEffect(() => {
    if (!conectado && !erro) return;
    if (conectado) toast("Instagram conectado.", "success");
    if (erro) toast(ERROS[erro] ?? ERROS.zernio, "error");
    recarregarInstagram();
    router.replace("/painel/instagram");
  }, [conectado, erro, toast, recarregarInstagram, router]);

  if (!instagram) return null;
  const ativa = instagram.account?.status === "active";

  const conectar = async () => {
    setOcupado(true);
    try {
      const r = await fetch("/api/ig/connect", { method: "POST" });
      const corpo = (await r.json().catch(() => null)) as { authUrl?: string; error?: string } | null;
      if (!r.ok || !corpo?.authUrl) {
        toast(corpo?.error ?? "Não deu pra começar a conexão. Tente de novo.", "error");
        return;
      }
      window.location.assign(corpo.authUrl);
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    const ok = await pedirConfirmacao({ titulo: "Desconectar o Instagram?", texto: "Os fluxos no ar ficam pausados até você conectar de novo.", rotulo: "Desconectar", destrutivo: true });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/ig/account", { method: "DELETE" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
        toast(corpo?.error ?? "Não deu pra desconectar. Tente de novo.", "error");
        return;
      }
      toast("Instagram desconectado.", "success");
      recarregarInstagram();
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-13 text-slate-600">{textoDaConta(instagram.account)}</p>
      {ativa ? (
        <button type="button" onClick={() => void desconectar()} disabled={ocupado} className="h-8 rounded-[var(--radius-control)] border border-line-200 px-2.5 text-13 text-slate-600 hover:text-volt-950 disabled:opacity-50">
          Desconectar
        </button>
      ) : (
        <button type="button" onClick={() => void conectar()} disabled={ocupado} className="h-8 rounded-[var(--radius-control)] bg-cobalt-500 px-2.5 text-13 font-medium text-canvas-100 disabled:opacity-50">
          Conectar Instagram
        </button>
      )}
      {folhaDeConfirmacao}
    </div>
  );
}
