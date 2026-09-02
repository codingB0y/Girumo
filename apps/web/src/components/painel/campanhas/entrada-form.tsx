"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { isHttpsUrl, type EntradaSettings, type LotadoDestino } from "@/lib/campaigns/settings";

type PageOption = { slug: string; title: string };

/** Dias até a data (fim do dia em Brasília); negativo = já passou. */
export function diasAte(iso: string, now = new Date()): number {
  const end = Date.parse(`${iso}T23:59:59.999-03:00`);
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[160ms]", checked ? "bg-cobalt-500" : "bg-volt-950/15")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-[160ms] ease-[var(--ease-fluxo)]", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Setting({ title, children, control }: { title: string; children: React.ReactNode; control: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 border-t border-volt-950/[0.07] py-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-volt-950">{title}</p>
      <div className="row-span-2 flex flex-col items-end gap-1">{control}</div>
      <div className="max-w-[58ch] text-xs leading-relaxed text-aco/60">{children}</div>
    </div>
  );
}

const inputCls = "block w-full rounded-[10px] border bg-poco px-3 py-2 text-sm text-volt-950 outline-none";

/**
 * Aba "Entrada" das configurações da campanha: como o link mestre se comporta.
 * Controlado de fora (`value`/`onChange`) para o formulário pai salvar tudo junto.
 */
export function EntradaForm({ value, onChange, pages }: { value: EntradaSettings; onChange: (v: EntradaSettings) => void; pages: PageOption[] }) {
  const name = useId();
  const set = (patch: Partial<EntradaSettings>) => onChange({ ...value, ...patch });
  const setLotado = (lotado: LotadoDestino) => set({ lotado });
  const dias = value.encerra_em ? diasAte(value.encerra_em) : null;
  const urlAtual = value.lotado.modo === "url" ? value.lotado.url : "";
  const urlInvalida = value.lotado.modo === "url" && urlAtual.length > 0 && !isHttpsUrl(urlAtual);

  const radio = (modo: LotadoDestino["modo"], titulo: string, desc: React.ReactNode, on: () => void) => (
    <label
      className={cn(
        "grid cursor-pointer grid-cols-[18px_1fr] gap-x-3 gap-y-1 rounded-xl border p-3 transition-colors duration-[160ms]",
        value.lotado.modo === modo ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-volt-950/[0.09] bg-papel hover:border-cobalt-500/30",
      )}
    >
      <input type="radio" name={name} value={modo} checked={value.lotado.modo === modo} onChange={on} className="mt-0.5 accent-cobalt-500" aria-label={titulo} />
      <span className="text-sm font-medium text-volt-950">{titulo}</span>
      <span className="col-start-2 text-xs text-aco/60">{desc}</span>
    </label>
  );

  return (
    <div>
      <Setting
        title="Abrir direto no aplicativo do WhatsApp"
        control={
          <>
            <Switch label="Abrir direto no aplicativo do WhatsApp" checked={value.deep_link} onChange={(v) => set({ deep_link: v })} />
            <span className="font-data text-[11px] text-aco/50">{value.deep_link ? "ligado" : "desligado"}</span>
          </>
        }
      >
        Deep link. Quem clica no Instagram ou no Facebook vai para o app, sem passar pela página do WhatsApp na web. Em computador, segue o link normal.
      </Setting>

      <Setting
        title="Um grupo por pessoa"
        control={
          <>
            <Switch label="Um grupo por pessoa" checked={value.um_grupo_por_pessoa} onChange={(v) => set({ um_grupo_por_pessoa: v })} />
            <span className="font-data text-[11px] text-aco/50">{value.um_grupo_por_pessoa ? "ligado" : "desligado"}</span>
          </>
        }
      >
        Quem já entrou por este link volta sempre para o mesmo grupo, em vez de cair no próximo. Vale por 90 dias, no mesmo aparelho e navegador.
      </Setting>

      <Setting
        title="Encerrar automaticamente"
        control={
          <>
            <input
              type="date"
              aria-label="Encerrar automaticamente"
              value={value.encerra_em ?? ""}
              onChange={(e) => set({ encerra_em: e.target.value || null })}
              className={cn(inputCls, "w-auto border-volt-950/10 focus:border-cobalt-500/50")}
            />
            {dias !== null && (
              <span className="font-data text-[11px] text-aco/50">{dias < 0 ? "encerrou" : dias === 0 ? "encerra hoje" : `faltam ${dias} dias`}</span>
            )}
          </>
        }
      >
        Depois desta data o link para de mandar gente para os grupos e mostra a tela de &ldquo;lotado&rdquo;. Em branco, nunca encerra sozinho.
      </Setting>

      <div className="border-t border-volt-950/[0.07] py-4">
        <p className="text-sm font-medium text-volt-950">Quando lotar (ou encerrar)</p>
        <p className="mb-3 mt-0.5 text-xs text-aco/60">O que o cliente vê quando não há vaga em nenhum grupo.</p>
        <div className="grid gap-2" role="radiogroup" aria-label="Quando lotar">
          {radio("aviso", "Só um aviso", <>&ldquo;Todos os grupos estão cheios. Em breve abriremos um novo.&rdquo;</>, () => setLotado({ modo: "aviso" }))}
          {radio(
            "pagina",
            "Lista de espera numa Página da conta",
            <>
              Captura nome e WhatsApp com consentimento, e o lead entra na campanha seguinte.
              {value.lotado.modo === "pagina" && (
                <select
                  aria-label="Página da lista de espera"
                  value={value.lotado.pagina_slug}
                  onChange={(e) => setLotado({ modo: "pagina", pagina_slug: e.target.value })}
                  className={cn(inputCls, "mt-2 border-volt-950/10")}
                >
                  <option value="">Escolha uma página publicada…</option>
                  {pages.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.title || p.slug}
                    </option>
                  ))}
                </select>
              )}
              {value.lotado.modo === "pagina" && pages.length === 0 && (
                <span className="mt-1 block text-atencao">Você ainda não tem página publicada. Crie uma em Páginas.</span>
              )}
            </>,
            () => setLotado({ modo: "pagina", pagina_slug: pages[0]?.slug ?? "" }),
          )}
          {radio(
            "url",
            "Mandar para outro link",
            <>
              Seu site, seu catálogo, outra campanha.
              {value.lotado.modo === "url" && (
                <input
                  type="url"
                  aria-label="Link de destino"
                  placeholder="https://…"
                  value={urlAtual}
                  onChange={(e) => setLotado({ modo: "url", url: e.target.value })}
                  className={cn(inputCls, "mt-2", urlInvalida ? "border-alerta/60" : "border-volt-950/10 focus:border-cobalt-500/50")}
                />
              )}
              {urlInvalida && <span className="mt-1 block text-alerta">Só aceitamos link começando com https://</span>}
            </>,
            () => setLotado({ modo: "url", url: urlAtual }),
          )}
        </div>
      </div>
    </div>
  );
}
