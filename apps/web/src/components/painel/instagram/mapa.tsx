"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { resumoDoBloco, rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import { layout, NODE_H, NODE_W, type EdgePos, type NodePos } from "@/lib/ig/flow/layout";
import { outsOf, type FlowDef } from "@/lib/ig/flow/types";
import { ICONE } from "./icones";

const COR: Record<EdgePos["kind"], string> = { principal: "var(--color-serie)", desvio: "var(--color-saida)", volta: "var(--color-slate-600)" };

function caminho(a: NodePos, b: NodePos, kind: EdgePos["kind"]): string {
  if (kind === "principal") {
    const x1 = a.x + NODE_W, y1 = a.y + 64, x2 = b.x, y2 = b.y + 64, c = Math.max(20, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  }
  if (kind === "desvio") {
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y;
    return `M ${x1} ${y1} C ${x1} ${y1 + 40}, ${x2} ${y2 - 40}, ${x2} ${y2}`;
  }
  const x1 = a.x + NODE_W, y1 = a.y + 40, x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H;
  return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 60} ${y2 + 50}, ${x2} ${y2}`;
}

/** Só leitura na fase 1: os mesmos blocos do passo a passo, na espinha. Cabe na largura disponível (escala para baixo, nunca para cima). */
export function Mapa({ def }: { def: FlowDef }) {
  const l = layout(def);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    // Piso de 0.6: abaixo disso o texto fica ilegível; fluxos largos rolam na horizontal dentro da caixa.
    const medir = () => setEscala(Math.max(0.6, Math.min(1, (el.clientWidth - 16) / l.width)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [l.width]);
  // layout() pode repetir um id quando dois ramos convergem no mesmo bloco: o primeiro vence.
  const unicos = l.nodes.filter((n, i) => l.nodes.findIndex((x) => x.id === n.id) === i);
  const pos = Object.fromEntries(unicos.map((n) => [n.id, n]));

  return (
    <div ref={caixa} data-testid="ig-mapa" role="region" tabIndex={0} aria-label={`Mapa do fluxo com ${def.nodes.length} blocos`} className="overflow-auto rounded-[10px] border border-line-200 bg-canvas-100">
      <div style={{ width: l.width * escala, height: l.height * escala }}>
        <div className="relative origin-top-left" style={{ width: l.width, height: l.height, transform: `scale(${escala})` }}>
          <svg className="absolute inset-0" width={l.width} height={l.height} aria-hidden="true">
            {l.edges.filter((e) => pos[e.from] && pos[e.to]).map((e) => (
              <path key={`${e.from}-${e.out}`} d={caminho(pos[e.from], pos[e.to], e.kind)} fill="none" stroke={COR[e.kind]} strokeWidth={e.kind === "principal" ? 3 : 2} strokeDasharray={e.kind === "volta" ? "4 4" : undefined} />
            ))}
          </svg>
          {unicos.map((n) => {
            const node = def.nodes.find((x) => x.id === n.id);
            if (!node) return null;
            const Icone = ICONE[node.type];
            return (
              <article key={n.id} className="absolute rounded-[10px] border border-line-200 bg-paper-0" style={{ left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H }}>
                <h3 className="flex h-10 items-center gap-2 border-b border-line-200 px-3 text-13 font-semibold text-volt-950">
                  <Icone className="h-4 w-4 text-slate-600" strokeWidth={1.75} aria-hidden="true" />{tituloDoBloco(node)}
                </h3>
                <p className="px-3 py-2 text-12 leading-snug text-slate-600">{resumoDoBloco(node)}</p>
                <ul className="border-t border-line-200 px-3 py-1.5 text-12 text-slate-600">
                  {outsOf(node).map((out) => <li key={out} className="flex items-center justify-between py-0.5"><span>{rotuloDaSaida(out, node)}</span><span aria-hidden="true" className="h-2 w-2 rounded-full border border-slate-600" /></li>)}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
