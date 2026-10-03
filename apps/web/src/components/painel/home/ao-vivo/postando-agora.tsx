"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Ban, Check, Clock, Loader2, X, type LucideIcon } from "lucide-react";
import { Bolha } from "@/components/painel/bolha";
import { useEntrega, LegendaDaEntrega, type LeituraDaEntrega } from "@/components/painel/campanhas/detalhe/entrega";
import type { Disparo, Schedule } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import {
  fraseDoAndamento,
  gradeDaEntrega,
  placarDosGrupos,
  proximosAgendamentos,
  rotuloDaCelula,
  terminaPorVolta,
  textoDoPost,
  tituloDaGrade,
} from "@/lib/painel/ao-vivo/postando";
import { quandoDoPost } from "@/lib/painel/campanha-visao";
import { aindaSaindo, postDaTabela, resumoDaEntrega, type EstadoDaEntrega } from "@/lib/painel/entrega";
import { cn } from "@/lib/utils";

/**
 * Cada estado diz o que é por ícone (12 px) e por contorno ou preenchimento; a cor
 * nunca está sozinha. "Na fila" e "falhou" são só contorno: um preenchimento fraco
 * não chega a 3:1 na superfície (nos dois temas), o contorno em slate/saida chega.
 */
const CELULA: Record<EstadoDaEntrega, { classe: string; Icone: LucideIcon; texto: string }> = {
  entregue: { classe: "bg-success-700 text-white", Icone: Check, texto: "entregue" },
  postando: { classe: "bg-cobalt-500 text-white", Icone: Loader2, texto: "postando" },
  na_fila: { classe: "border border-slate-600 text-slate-600", Icone: Clock, texto: "na fila" },
  falhou: { classe: "border border-saida text-saida", Icone: X, texto: "falhou" },
  cancelado: { classe: "bg-slate-600/40 text-slate-600", Icone: Ban, texto: "cancelado" },
};
const ORDEM_DA_LEGENDA: EstadoDaEntrega[] = ["entregue", "postando", "na_fila", "falhou", "cancelado"];

const OUTRA_MIDIA: Record<string, string> = { video: "com vídeo", audio: "com áudio", file: "com arquivo" };

function Previa({ post, campanha }: { post: Disparo; campanha: string }) {
  const [aberta, setAberta] = useState(false);
  const [cortado, setCortado] = useState(false);
  const textoRef = useRef<HTMLSpanElement>(null);
  const idDaPrevia = useId();
  const texto = textoDoPost(post);
  const foto = post.mediaType === "image" && post.mediaId ? `/api/media/${post.mediaId}` : undefined;
  const nota = post.poll ? `enquete com ${post.poll.options.length} opções` : post.mediaType ? OUTRA_MIDIA[post.mediaType] : undefined;

  // Mede o texto cortado em vez de adivinhar pelo tamanho: "ver tudo" só aparece se algo ficou de fora.
  useEffect(() => {
    const el = textoRef.current;
    if (!el || aberta) return;
    const medir = () => setCortado(el.scrollHeight > el.clientHeight);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [aberta, texto]);

  return (
    <div>
      <div id={idDaPrevia}>
        <Bolha
          grupo={campanha}
          hora={horaBR(quandoDoPost(post))}
          texto={texto}
          vazio="Post com mídia, sem texto."
          foto={foto}
          mencaoTodos={post.mentionAll}
          cortar={!aberta}
          textoRef={textoRef}
        />
      </div>
      {(cortado || aberta) && (
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={idDaPrevia}
          onClick={() => setAberta((v) => !v)}
          className="mt-1.5 text-13 font-semibold text-cobalt-500 hover:underline"
        >
          {aberta ? "ver menos" : "ver tudo"}
        </button>
      )}
      {nota && <p className="mt-1.5 text-12 text-slate-600">{nota}</p>}
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
      <h3 className="text-13 font-semibold text-volt-950">{tituloDaGrade(celulas.length)}</h3>
      <ul className="flex flex-wrap gap-1">
        {celulas.map((c) => {
          const rotulo = rotuloDaCelula(c);
          const { classe, Icone } = CELULA[c.estado];
          return (
            <li key={`${post.id}:${c.id}`}>
              <span
                role="img"
                aria-label={rotulo}
                title={rotulo}
                className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-[3px]", classe, c.estado === "postando" && "motion-safe:animate-pulse")}
              >
                <Icone aria-hidden="true" className={cn("h-3 w-3", c.estado === "postando" && "motion-safe:animate-spin")} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-12 text-slate-600">
        {ORDEM_DA_LEGENDA.map((estado) => (
          <span key={estado} className="inline-flex items-center gap-1">
            <span className={cn("h-2.5 w-2.5 rounded-[2px]", CELULA[estado].classe)} aria-hidden="true" />
            {CELULA[estado].texto}
          </span>
        ))}
      </p>
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
  const termino = saindo && resumo ? terminaPorVolta(resumo, agora) : null;
  const pct = total > 0 ? Math.min(100, Math.round((feitos / total) * 100)) : 0;
  const frase = fraseDoAndamento({ post, resumo, hora, termino });

  return (
    <div className="space-y-1.5">
      <span className="pn-lotacao block" role="progressbar" aria-label="Grupos entregues" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitos}>
        <span className="pn-lotacao__cheio" style={{ width: `${pct}%` }} />
      </span>
      <p className="flex flex-wrap items-baseline gap-x-2 text-13 text-slate-600">
        {saindo && <span className="font-semibold tabular-nums text-volt-950">{placarDosGrupos(feitos, total)}</span>}
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

function ProximosAgendamentos({ agendamentos, agora, carregou }: { agendamentos: Schedule[]; agora: Date; carregou: boolean }) {
  const proximos = proximosAgendamentos(agendamentos, agora);
  return (
    <div className="space-y-2">
      <h3 className="text-13 font-semibold text-volt-950">Próximos</h3>
      {!carregou ? (
        <p className="text-13 text-slate-600">A agenda não carregou.</p>
      ) : proximos.length === 0 ? (
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

type Props = {
  posts: Disparo[];
  grupos: Group[];
  agendamentos: Schedule[];
  agora: Date;
  /** Falso = a lista de posts não carregou: "Nada saindo agora" seria falso. */
  disparosOk: boolean;
  schedulesOk: boolean;
};

/** "Postando agora" da Início "Ao vivo" (spec 2026-10-02): o post que sai, grupo a grupo, e o que vem depois. */
export function PostandoAgora({ posts, grupos, agendamentos, agora, disparosOk, schedulesOk }: Props) {
  // postDaTabela devolve DispatchView; o Disparo (com campaignName) é o mesmo item da lista.
  const escolhido = postDaTabela(posts, agora);
  const post = posts.find((p) => p.id === escolhido?.id) ?? null;
  // A entrega faz a própria releitura enquanto o post sai; trocar de post já lê de novo.
  const { entrega, leitura, desatualizada } = useEntrega(post?.id ?? null, 0);
  const campanha = post?.campaignName || "Post";
  const hora = post ? horaBR(quandoDoPost(post)) : "";
  const abertura = (post ? textoDoPost(post) : "").split("\n")[0];

  return (
    <section data-testid="inicio-postando" aria-labelledby="postando-titulo" className="min-w-0 rounded-[10px] border border-line-200 bg-paper-0">
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
            <Previa key={post.id} post={post} campanha={campanha} />
            <Grade post={post} grupos={grupos} leitura={leitura} entrega={entrega} desatualizada={desatualizada} hora={hora} />
          </>
        ) : !disparosOk ? (
          <p className="text-13 text-slate-600">Os posts não carregaram.</p>
        ) : (
          <div>
            <p className="text-15 font-semibold text-volt-950">Nada saindo agora.</p>
            <p className="mt-1 text-13 text-slate-600">O post que estiver saindo aparece aqui, grupo a grupo.</p>
            <Link href="/painel/disparos" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
              Postar
            </Link>
          </div>
        )}
        <ProximosAgendamentos agendamentos={agendamentos} agora={agora} carregou={schedulesOk} />
      </div>
    </section>
  );
}
