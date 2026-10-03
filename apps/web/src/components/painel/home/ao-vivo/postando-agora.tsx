"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bolha } from "@/components/painel/bolha";
import { useEntrega, LegendaDaEntrega, type LeituraDaEntrega } from "@/components/painel/campanhas/detalhe/entrega";
import type { Disparo, Schedule } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import { gradeDaEntrega, proximosAgendamentos, rotuloDaCelula, terminaPorVolta } from "@/lib/painel/ao-vivo/postando";
import { quandoDoPost } from "@/lib/painel/campanha-visao";
import { aindaSaindo, postDaTabela, resumoDaEntrega, type EstadoDaEntrega } from "@/lib/painel/entrega";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";

/** Mais que isto (caracteres ou quebras de linha) e a prévia vem cortada em ~6 linhas. */
const TEXTO_LONGO_CARACTERES = 280;
const TEXTO_LONGO_LINHAS = 6;
/** 6 linhas de 20 px da bolha + o respiro dela; a foto (até 180 px + margem) soma por cima. */
const ALTURA_DE_6_LINHAS_PX = 148;
const ALTURA_DA_FOTO_PX = 192;

const COR_DA_CELULA: Record<EstadoDaEntrega, string> = {
  entregue: "bg-success-700/70",
  postando: "bg-cobalt-500 motion-safe:animate-pulse",
  na_fila: "bg-line-200",
  falhou: "bg-saida",
  cancelado: "bg-slate-600/40",
};

const MIDIA_SEM_FOTO: Record<string, string> = { video: "com vídeo", audio: "com áudio", file: "com arquivo" };

const textoLongo = (t: string) => t.length > TEXTO_LONGO_CARACTERES || t.split("\n").length > TEXTO_LONGO_LINHAS;

function Previa({ post, campanha }: { post: Disparo; campanha: string }) {
  const [aberta, setAberta] = useState(false);
  const foto = post.mediaType === "image" && post.mediaId ? `/api/media/${post.mediaId}` : undefined;
  const longo = textoLongo(post.body);
  const corta = longo && !aberta;
  const semFoto = post.mediaType ? MIDIA_SEM_FOTO[post.mediaType] : undefined;
  return (
    <div>
      <div
        id="postando-previa"
        className={cn(corta && "overflow-hidden")}
        style={corta ? { maxHeight: ALTURA_DE_6_LINHAS_PX + (foto ? ALTURA_DA_FOTO_PX : 0) } : undefined}
      >
        <Bolha
          grupo={campanha}
          hora={horaBR(quandoDoPost(post))}
          texto={post.body}
          vazio="Post com mídia, sem texto."
          foto={foto}
          mencaoTodos={post.mentionAll}
        />
      </div>
      {longo && (
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls="postando-previa"
          onClick={() => setAberta((v) => !v)}
          className="mt-1.5 text-13 font-semibold text-cobalt-500 hover:underline"
        >
          {aberta ? "ver menos" : "ver tudo"}
        </button>
      )}
      {semFoto && <p className="mt-1.5 text-12 text-slate-600">{semFoto}</p>}
    </div>
  );
}

function Grade({ post, grupos, leitura, entrega, desatualizada, hora }: {
  post: Disparo;
  grupos: Group[];
  leitura: LeituraDaEntrega;
  entrega: ReturnType<typeof useEntrega>["entrega"];
  desatualizada: boolean;
  hora: string;
}) {
  const celulas = useMemo(() => (entrega ? gradeDaEntrega(entrega.grupos, grupos) : []), [entrega, grupos]);
  const resumo = useMemo(() => (entrega ? resumoDaEntrega(entrega.grupos) : null), [entrega]);

  if (!entrega || !resumo) {
    return (
      <p className="text-13 text-slate-600">{leitura === "falhou" ? "A entrega não carregou." : "lendo a entrega…"}</p>
    );
  }
  if (celulas.length === 0) return <p className="text-13 text-slate-600">Nenhum grupo na entrega ainda.</p>;
  return (
    <div className="space-y-2">
      <h3 className="text-13 font-semibold text-volt-950">Entrega nos {numero(celulas.length)} grupos</h3>
      <ul className="flex flex-wrap gap-1">
        {celulas.map((c) => {
          const rotulo = rotuloDaCelula(c);
          return (
            <li key={`${post.id}:${c.id}`}>
              <span role="img" aria-label={rotulo} title={rotulo} className={cn("block h-[22px] w-[22px] rounded-[3px]", COR_DA_CELULA[c.estado])} />
            </li>
          );
        })}
      </ul>
      <LegendaDaEntrega hora={hora} resumo={resumo} desatualizada={desatualizada} />
    </div>
  );
}

function Andamento({ post, agora, entrega, hora }: {
  post: Disparo;
  agora: Date;
  entrega: ReturnType<typeof useEntrega>["entrega"];
  hora: string;
}) {
  const resumo = entrega && entrega.grupos.length > 0 ? resumoDaEntrega(entrega.grupos) : null;
  const feitos = resumo ? resumo.entregues : post.sent;
  const total = resumo ? resumo.total : post.total;
  const saindo = resumo ? aindaSaindo(resumo) : post.status === "running" || post.status === "queued";
  const falharam = resumo?.falharam ?? 0;
  const termino = saindo && resumo ? terminaPorVolta(resumo, agora) : null;
  const pct = total > 0 ? Math.min(100, Math.round((feitos / total) * 100)) : 0;
  const placar = `${numero(feitos)} de ${numero(total)} grupos`;

  let frase: string;
  if (saindo) frase = termino ? `termina por volta de ${termino}` : "saindo agora";
  else if (resumo && resumo.entregues === 0 && falharam > 0) frase = `Não saiu · ${numero(falharam)} ${falharam === 1 ? "falhou" : "falharam"}`;
  else if (falharam > 0) frase = `Saiu às ${hora} · ${numero(feitos)} de ${numero(total)} · ${numero(falharam)} ${falharam === 1 ? "falhou" : "falharam"}`;
  else frase = `Saiu às ${hora} · ${numero(feitos)} de ${numero(total)}`;

  return (
    <div className="space-y-1.5">
      <span className="pn-lotacao block" role="progressbar" aria-label="Grupos entregues" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitos}>
        <span className="pn-lotacao__cheio" style={{ width: `${pct}%` }} />
      </span>
      <p className="flex flex-wrap items-baseline gap-x-2 text-13 text-slate-600">
        {saindo && <span className="font-semibold tabular-nums text-volt-950">{placar}</span>}
        <span>{frase}</span>
        {!saindo && post.campaignSlug && (
          <Link href={`/painel/campanhas/${post.campaignSlug}`} className="font-semibold text-cobalt-500 hover:underline">
            Ver na campanha
          </Link>
        )}
      </p>
    </div>
  );
}

function ProximosAgendamentos({ agendamentos, agora }: { agendamentos: Schedule[]; agora: Date }) {
  const proximos = proximosAgendamentos(agendamentos, agora);
  return (
    <div className="space-y-2">
      <h3 className="text-13 font-semibold text-volt-950">Próximos</h3>
      {proximos.length === 0 ? (
        <p className="text-13 text-slate-600">
          Nada agendado.{" "}
          <Link href="/painel/agenda" className="font-semibold text-cobalt-500 hover:underline">
            Agendar
          </Link>
        </p>
      ) : (
        <ol className="space-y-1 text-13 text-volt-950">
          {proximos.map((p) => (
            <li key={p.id} className="truncate">
              <span className="font-semibold tabular-nums">{p.quando}</span> · {p.nome}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type Props = { posts: Disparo[]; grupos: Group[]; agendamentos: Schedule[]; agora: Date; versao: number };

/** "Postando agora" da Início "Ao vivo" (spec 2026-10-02): o post que sai, grupo a grupo, e o que vem depois. */
export function PostandoAgora({ posts, grupos, agendamentos, agora, versao }: Props) {
  // postDaTabela devolve DispatchView; o Disparo (com campaignName) é o mesmo item da lista.
  const escolhido = postDaTabela(posts, agora);
  const post = posts.find((p) => p.id === escolhido?.id) ?? null;
  const { entrega, leitura, desatualizada } = useEntrega(post?.id ?? null, versao);
  const campanha = post?.campaignName || "Post";
  const hora = post ? horaBR(quandoDoPost(post)) : "";
  const abertura = post?.body.trim().split("\n")[0] ?? "";

  return (
    <section data-testid="inicio-postando" aria-labelledby="postando-titulo" className="rounded-[10px] border border-line-200 bg-paper-0">
      <div className="border-b border-line-200 px-5 py-3">
        <h2 id="postando-titulo" className="text-[16px] font-semibold text-volt-950">
          Postando agora
        </h2>
      </div>
      <div className="space-y-5 px-5 py-4">
        {post ? (
          <>
            <p className="truncate text-13 text-slate-600">
              <span className="font-semibold text-volt-950">{abertura || "Post com mídia"}</span> · {campanha}
            </p>
            <Andamento post={post} agora={agora} entrega={entrega} hora={hora} />
            <Previa post={post} campanha={campanha} />
            <Grade post={post} grupos={grupos} leitura={leitura} entrega={entrega} desatualizada={desatualizada} hora={hora} />
          </>
        ) : (
          <div>
            <p className="text-15 font-semibold text-volt-950">Nada saindo agora.</p>
            <p className="mt-1 text-13 text-slate-600">O post que estiver saindo aparece aqui, grupo a grupo.</p>
            <Link href="/painel/disparos" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
              Postar
            </Link>
          </div>
        )}
        <ProximosAgendamentos agendamentos={agendamentos} agora={agora} />
      </div>
    </section>
  );
}
