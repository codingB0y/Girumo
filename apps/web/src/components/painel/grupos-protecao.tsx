"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, Smartphone, UserPlus, Users } from "lucide-react";
import type { ProtectionSummary } from "@/lib/groups/admin-protection";

/**
 * Proteção dos grupos — o único prejuízo irreversível do produto, dito em voz
 * alta.
 *
 * Se o número do lojista cair (ban, troca de aparelho, os 14 dias de linked
 * device) e ele for o único administrador de um grupo, esse grupo fica órfão:
 * ninguém consegue mais administrá-lo, e a lista de clientes não se recupera.
 * O WhatsApp não tem endpoint que devolva a administração de um grupo sem admin.
 *
 * Nenhum número aqui é estimado: vem da contagem gravada em `groups`, apurada
 * no sync e mantida pelo webhook `group-participants.update`.
 */
export function GruposProtecao() {
  const [resumo, setResumo] = useState<ProtectionSummary | null>(null);
  const [falhou, setFalhou] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/groups/protecao");
      if (!res.ok) throw new Error(String(res.status));
      setResumo((await res.json()) as ProtectionSummary);
      setFalhou(false);
    } catch {
      // Painel informativo: uma falha de leitura não pode virar alarme.
      setFalhou(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (falhou || resumo === null) return null;
  // Sem grupo administrado a pergunta não se aplica — não é "tudo certo",
  // é que ainda não há ativo a proteger.
  if (resumo.administrados === 0) return null;

  return (
    <section aria-labelledby="protecao-titulo" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="protecao-titulo"
          className="font-display text-xl font-bold tracking-[-0.02em] text-volt-950"
        >
          Proteção dos seus grupos
        </h2>
        <span className="font-data text-[11px] uppercase tracking-wider text-aco/50">
          {resumo.administrados} {resumo.administrados === 1 ? "grupo seu" : "grupos seus"}
        </span>
      </div>
      <p className="font-editorial mt-1 text-[17px] italic text-ardosia">
        Quem mais administra os seus grupos, se o seu número sair do ar.
      </p>

      <div className="mt-4">
        {resumo.semBackup > 0 ? (
          <EmRisco resumo={resumo} />
        ) : resumo.medidos > 0 ? (
          <Protegido resumo={resumo} />
        ) : (
          <NaoMedido />
        )}
      </div>
    </section>
  );
}

function EmRisco({ resumo }: { resumo: ProtectionSummary }) {
  const plural = resumo.semBackup !== 1;

  return (
    <article className="pn-card rounded-2xl p-5 sm:p-6">
      {/* Mesmo tratamento do aviso de silêncio em numero-saude.tsx: o alerta é
          o fundo âmbar, não uma borda de destaque. */}
      <header className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-volt-950">
            {resumo.semBackup} {plural ? "grupos dependem" : "grupo depende"} só do seu número
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            Você é o único administrador {plural ? "deles" : "dele"}. Se esse número for bloqueado
            ou você trocar de aparelho,{" "}
            <strong className="font-semibold text-volt-950">
              {resumo.membrosEmRisco.toLocaleString("pt-BR")}{" "}
              {resumo.membrosEmRisco === 1 ? "pessoa fica" : "pessoas ficam"} num grupo que ninguém
              mais consegue administrar
            </strong>{" "}
            — e não existe como recuperar a lista depois.
          </p>
        </div>
      </header>

      <ul className="mt-4 divide-y divide-black/5 border-y border-black/5">
        {resumo.emRisco.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-4 py-2.5">
            {/* Nome de grupo é conteúdo de terceiros: só via escape do JSX. */}
            <span className="truncate text-sm text-volt-950">{g.name}</span>
            <span className="font-data inline-flex shrink-0 items-center gap-1.5 text-[12px] text-aco/60">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {g.members.toLocaleString("pt-BR")}
            </span>
          </li>
        ))}
      </ul>
      {resumo.semBackup > resumo.emRisco.length && (
        <p className="mt-2 text-[12px] text-aco/60">
          e mais {resumo.semBackup - resumo.emRisco.length} —{" "}
          <Link href="/painel/grupos" className="underline underline-offset-2 hover:text-volt-950">
            ver todos os grupos
          </Link>
        </p>
      )}

      <h4 className="font-data mt-5 text-[11px] uppercase tracking-wider text-aco/60">
        Como resolver
      </h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Saida
          icone={<UserPlus className="h-4 w-4 text-cobalt-500" aria-hidden="true" />}
          titulo="Promova alguém de confiança"
          preco="de graça, agora"
          descricao="No WhatsApp, abra o grupo, toque no nome do seu sócio ou da sua vendedora e escolha Tornar administrador do grupo. Pronto: se o seu número cair, o grupo continua de pé."
        />
        <Saida
          icone={<Smartphone className="h-4 w-4 text-cobalt-500" aria-hidden="true" />}
          titulo="Conecte um segundo número"
          preco="add-on da assinatura"
          descricao="Um segundo chip seu ligado ao Girumo, que você também torna admin dos grupos. Vira o seu backup sem depender de outra pessoa."
          acao={{ href: "/painel/configuracoes", label: "Ver planos" }}
        />
      </div>
    </article>
  );
}

function Protegido({ resumo }: { resumo: ProtectionSummary }) {
  return (
    <article className="pn-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-volt-950">
            {resumo.comBackup === 1
              ? "Seu grupo tem mais de um administrador"
              : `Seus ${resumo.comBackup} grupos têm mais de um administrador`}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ardosia">
            Se o seu número sair do ar, alguém continua podendo administrar. É a diferença entre
            perder um número e perder a lista.
          </p>
          {resumo.naoMedidos > 0 && (
            <p className="mt-2 text-[13px] text-aco/60">
              {resumo.naoMedidos}{" "}
              {resumo.naoMedidos === 1 ? "grupo ainda não foi conferido" : "grupos ainda não foram conferidos"}
              . Sincronize os grupos para incluir na conta.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function NaoMedido() {
  return (
    <article className="pn-card rounded-2xl p-5 sm:p-6">
      <p className="text-sm leading-relaxed text-ardosia">
        Ainda não conferimos quem administra os seus grupos.{" "}
        <Link href="/painel/grupos" className="underline underline-offset-2 hover:text-volt-950">
          Sincronize os grupos
        </Link>{" "}
        e mostramos aqui quais deles dependem só do seu número.
      </p>
    </article>
  );
}

function Saida({
  icone,
  titulo,
  preco,
  descricao,
  acao,
}: {
  icone: React.ReactNode;
  titulo: string;
  preco: string;
  descricao: string;
  acao?: { href: string; label: string };
}) {
  return (
    <div className="pn-poco rounded-xl p-4">
      <div className="flex items-center gap-2">
        {icone}
        <span className="text-sm font-semibold text-volt-950">{titulo}</span>
      </div>
      <span className="font-data mt-0.5 block text-[11px] uppercase tracking-wider text-aco/50">
        {preco}
      </span>
      <p className="mt-2 text-[13px] leading-relaxed text-ardosia">{descricao}</p>
      {acao && (
        <Link
          href={acao.href}
          className="mt-3 inline-flex text-[13px] font-medium text-cobalt-500 underline underline-offset-2 transition-colors duration-[160ms] hover:text-volt-950"
        >
          {acao.label}
        </Link>
      )}
    </div>
  );
}
