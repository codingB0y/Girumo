"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bolha } from "@/components/painel/bolha";
import { useEntrega, type LeituraDaEntrega } from "@/components/painel/campanhas/detalhe/entrega";
import type { Disparo, Schedule } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import {
  estaSaindo,
  fraseDoAndamento,
  placarDosGrupos,
  proximosAgendamentos,
  segmentosDaEntrega,
  terminaPorVolta,
  textoDoPost,
  versaoDoPost,
} from "@/lib/painel/ao-vivo/postando";
import { quandoDoPost } from "@/lib/painel/campanha-visao";
import { postDaTabela, resumoDaEntrega, type EstadoDaEntrega } from "@/lib/painel/entrega";
import { numero } from "@/lib/painel/grupos";
import type { OfferTotalsRow } from "@/lib/stores/flash-offers";
import { cn } from "@/lib/utils";

/**
 * A cor de cada segmento da barra de entrega e do quadradinho da legenda (spec G2, decisão 8). A legenda
 * escreve o estado, então a cor não está sozinha. "Na fila" é o tom do trilho: é o que ainda não saiu.
 */
const SEGMENTO: Record<EstadoDaEntrega, string> = {
  entregue: "bg-success-700",
  postando: "bg-cobalt-500",
  na_fila: "bg-line-200",
  falhou: "bg-saida",
  cancelado: "bg-slate-600/40",
};

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
      {nota && <p className="mt-1.5 text-13 text-slate-600">{nota}</p>}
    </div>
  );
}

/**
 * A barra de três segmentos e a legenda (spec G2, decisão 8): a grade de 40 células saiu; a entrega grupo a
 * grupo mora em Disparos, para onde o link do cabeçalho leva. A barra é decorativa: a legenda é o texto.
 */
function BarraDaEntrega({ leitura, entrega, desatualizada }: {
  leitura: LeituraDaEntrega;
  entrega: ReturnType<typeof useEntrega>["entrega"];
  desatualizada: boolean;
}) {
  const resumo = useMemo(() => (entrega ? resumoDaEntrega(entrega.grupos) : null), [entrega]);
  if (!entrega || !resumo) {
    return <p className="text-13 text-slate-600">{leitura === "falhou" ? "A entrega não carregou." : "lendo a entrega…"}</p>;
  }
  if (resumo.total === 0) return <p className="text-13 text-slate-600">Nenhum grupo na entrega ainda.</p>;
  const segmentos = segmentosDaEntrega(resumo);
  return (
    <div className="space-y-2">
      <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-[4px]">
        {segmentos
          .filter((s) => s.n > 0)
          .map((s) => (
            <span key={s.estado} className={cn("block", SEGMENTO[s.estado], s.estado === "postando" && "motion-safe:animate-pulse")} style={{ flex: s.n }} />
          ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-13 text-slate-600">
        {segmentos.map((s) => (
          <span key={s.estado} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-[2px]", SEGMENTO[s.estado])} aria-hidden="true" />
            <span>
              <span className="font-semibold tabular-nums text-volt-950">{numero(s.n)}</span> {s.texto}
            </span>
          </span>
        ))}
        {desatualizada && <span>· não deu para atualizar agora; tentando de novo</span>}
      </p>
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
  const saindo = estaSaindo(post, resumo);
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
  agendamentos: Schedule[];
  agora: Date;
  /** Falso = a lista de posts não carregou: "Nada saindo agora" seria falso. */
  disparosOk: boolean;
  schedulesOk: boolean;
  /** Totais das relâmpagos do dia, por post: a linha "Pediram até agora" só existe com oferta ligada ao post. */
  totaisDoDia: OfferTotalsRow[];
};

/** "Postando agora" da Início "Ao vivo" (spec G2, decisão 8): o post que sai, a barra de entrega e o que vem depois. */
export function PostandoAgora({ posts, agendamentos, agora, disparosOk, schedulesOk, totaisDoDia }: Props) {
  // postDaTabela devolve DispatchView; o Disparo (com campaignName) é o mesmo item da lista.
  const escolhido = postDaTabela(posts, agora);
  const post = posts.find((p) => p.id === escolhido?.id) ?? null;
  // A entrega faz a própria releitura enquanto o post sai; trocar de post, ou ele mudar de status/contagem na recarga da página, lê de novo.
  const { entrega, leitura, desatualizada } = useEntrega(post?.id ?? null, versaoDoPost(post));
  const campanha = post?.campaignName || "Post";
  const hora = post ? horaBR(quandoDoPost(post)) : "";
  const abertura = (post ? textoDoPost(post) : "").split("\n")[0];
  const pedidos = post ? totaisDoDia.find((t) => t.broadcastId === post.id) : undefined;

  return (
    <section data-testid="inicio-postando" aria-labelledby="postando-titulo" className="min-w-0 rounded-[10px] border border-line-200 bg-paper-0 max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
      <div className="flex items-center justify-between gap-3 border-b border-line-200 px-5 py-3">
        <h2 id="postando-titulo" className="text-[16px] font-semibold text-volt-950">
          Postando agora
        </h2>
        {/* A entrega grupo a grupo mora em Disparos (decisão 8). */}
        <Link href="/painel/disparos" className="shrink-0 text-13 font-semibold text-cobalt-500 hover:underline">
          Ver em Disparos
        </Link>
      </div>
      <div className="space-y-5 px-5 py-4">
        {post ? (
          <>
            <p className="truncate text-13 text-slate-600">
              <span className="font-semibold text-volt-950">{abertura || "Post com mídia"}</span> · {campanha}
            </p>
            <Andamento post={post} agora={agora} entrega={entrega} hora={hora} />
            {pedidos && (
              <p className="text-13 text-slate-600">
                <span className="font-semibold text-volt-950">Pediram até agora: <span className="tabular-nums">{pedidos.pediram}</span></span>
                {pedidos.vendeu > 0 && <> · {pedidos.vendeu} {pedidos.vendeu === 1 ? "vendida" : "vendidas"}</>}
              </p>
            )}
            <Previa key={post.id} post={post} campanha={campanha} />
            <BarraDaEntrega leitura={leitura} entrega={entrega} desatualizada={desatualizada} />
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
