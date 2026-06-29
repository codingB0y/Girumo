"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  Pencil,
  X,
  Check,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";

const SECTIONS = ["Cadastro", "Página de entrada", "Página de espera", "Integrações"];

export type CampaignConfigInitial = {
  avatar?: string | null;
  titulo?: string;
  code?: string;
  automatizar?: boolean;
  tipoLink?: string;
  ignorarEntrada?: boolean;
  deepLink?: boolean;
  travarLead?: boolean;
  capturarLead?: boolean;
};

export function CampaignConfig({
  mode,
  slug,
  initial,
}: {
  mode: "create" | "edit";
  slug?: string;
  initial?: CampaignConfigInitial;
}) {
  const router = useRouter();
  const code = initial?.code ?? "31204";
  const backHref = mode === "edit" && slug ? `/painel/campanhas/${slug}` : "/painel/campanhas";

  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);

  const [avatar, setAvatar] = useState<string | null>(initial?.avatar ?? null);
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [automatizar, setAutomatizar] = useState(initial?.automatizar ?? true);
  const [tipoLink, setTipoLink] = useState(initial?.tipoLink ?? "URL simplificada");
  const [ignorarEntrada, setIgnorarEntrada] = useState(initial?.ignorarEntrada ?? false);
  const [deepLink, setDeepLink] = useState(initial?.deepLink ?? true);
  const [travarLead, setTravarLead] = useState(initial?.travarLead ?? false);
  const [capturarLead, setCapturarLead] = useState(initial?.capturarLead ?? true);

  const canNext = idx === 0 ? titulo.trim().length > 0 : true;

  /* sucesso ao criar */
  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="hf-enter flex h-16 w-16 items-center justify-center rounded-full bg-sucesso/10 text-sucesso">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="font-display mt-6 text-2xl font-extrabold tracking-[-0.03em]">Campanha criada!</h1>
        <p className="mt-2 text-aco">Seu link de captação está pronto pra divulgar.</p>
        <div className="mt-4 rounded-xl border border-breu/10 bg-white px-4 py-3">
          <CopyLink url={`meugrupo.vip/c/${code}`} />
        </div>
        <button
          onClick={() => router.push("/painel/campanhas/manychat-captacao")}
          className="mt-7 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
        >
          Abrir campanha
        </button>
      </div>
    );
  }

  const sections = [
    /* ── CADASTRO ── */
    <Card key="cadastro">
      <Field label="Imagem do grupo" hint="Exibida nas páginas de entrada e espera, e no perfil dos grupos.">
        <div className="flex items-center gap-4">
          <div className="relative">
            <label className="block h-20 w-20 cursor-pointer overflow-hidden rounded-2xl">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-[#25D366] text-white">
                  <MessageCircle className="h-9 w-9" />
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAvatar(URL.createObjectURL(f));
                }}
              />
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-iris text-white shadow">
                <Pencil className="h-3.5 w-3.5" />
              </span>
            </label>
            {avatar && (
              <button
                onClick={() => setAvatar(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-breu/10 bg-white text-aco/60 shadow transition hover:text-alerta"
                aria-label="Remover imagem"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-xs text-aco/55">Clique para enviar (JPG ou PNG). Recomendado 400×400.</p>
        </div>
      </Field>

      <Field label="Título" hint="Defina um nome. Ex: “Saldão Mega Stock Atacado”.">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nome da campanha…" className={inputCls} />
      </Field>

      <Field label="Link da campanha" hint="Gerado automaticamente — é o link que você divulga.">
        <div className="flex items-center justify-between rounded-xl border border-breu/10 bg-bruma/40 px-3.5 py-2.5">
          <CopyLink url={`meugrupo.vip/c/${code}`} />
        </div>
      </Field>

      <Field label="Data/hora da veiculação" hint="Deixe em branco e a campanha fica sempre ativa.">
        <input type="datetime-local" className={inputCls} />
      </Field>

      <Field label="Automatizar criação de grupos/comunidades?" hint="O HubFlow cria um grupo novo automaticamente quando o atual lota.">
        <ToggleInline on={automatizar} setOn={setAutomatizar} labelOn="Sim, criar no automático" labelOff="Não, gerencio na mão" />
      </Field>

      <Field label="Tipo de link de redirecionamento" hint="Por segurança, o padrão usa chave secreta.">
        <Select value={tipoLink} onChange={setTipoLink} options={["URL simplificada", "URL com chave secreta"]} />
      </Field>
    </Card>,

    /* ── PÁGINA DE ENTRADA ── */
    <Card key="entrada">
      <Field label="Ignorar página de entrada?" hint="Se ativo, o lead vai direto pro grupo (sem página intermediária).">
        <ToggleInline on={ignorarEntrada} setOn={setIgnorarEntrada} labelOn="Ir direto pro grupo" labelOff="Mostrar página de entrada" />
      </Field>
      {!ignorarEntrada ? (
        <>
          <Field label="Título" hint="Exibido abaixo do logo.">
            <input placeholder="Ex: Entre no nosso grupo VIP" className={inputCls} />
          </Field>
          <Field label="Texto">
            <textarea rows={3} placeholder="Mensagem de boas-vindas…" className={inputCls} />
          </Field>
          <Field label="Texto do botão">
            <input defaultValue="Entrar no Grupo!" className={inputCls} />
          </Field>
          <Field label="Mensagem de redirecionamento" hint="Alerta antes de levar pro grupo.">
            <input defaultValue="Por favor, aguarde 5 segundos." className={inputCls} />
          </Field>
          <Field label="Deep linking" hint="Abre o WhatsApp direto, sem passar pela web.">
            <ToggleInline on={deepLink} setOn={setDeepLink} labelOn="Ativado" labelOff="Desativado" />
          </Field>
          <Field label="Travar lead em mais de um grupo?" hint="Impede a mesma pessoa de entrar em vários grupos.">
            <ToggleInline on={travarLead} setOn={setTravarLead} labelOn="Travar" labelOff="Permitir" />
          </Field>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-bruma/50 px-4 py-3.5">
          <Sparkles className="h-5 w-5 shrink-0 text-iris" />
          <p className="text-sm text-aco">Página de entrada desativada — os leads vão direto pro grupo.</p>
        </div>
      )}
    </Card>,

    /* ── PÁGINA DE ESPERA ── */
    <Card key="espera">
      <p className="rounded-2xl bg-iris/[0.05] px-4 py-3 text-sm text-aco">
        Exibida só quando a campanha está <strong className="text-breu">cheia</strong>, fora do prazo ou sem grupo vinculado.
      </p>
      <Field label="Capturar dados do cliente (lead)?" hint="Mostra um formulário de captura — você exporta os leads depois.">
        <ToggleInline on={capturarLead} setOn={setCapturarLead} labelOn="Capturar leads" labelOff="Não capturar" />
      </Field>
      <Field label="URL externa" hint="Se preenchida, redireciona pra cá quando estiver cheio.">
        <input placeholder="https://…" className={inputCls} />
      </Field>
      <Field label="Vídeo de instruções" hint="Cole apenas a URL do YouTube.">
        <input placeholder="https://youtube.com/…" className={inputCls} />
      </Field>
    </Card>,

    /* ── INTEGRAÇÕES ── */
    <Card key="integracoes">
      <p className="text-sm text-aco/65">Rastreie cliques e conversões nas suas campanhas de anúncio.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pixel do Facebook"><input placeholder="código numérico" className={inputCls} /></Field>
        <Field label="Evento do Facebook"><Select value="Page View" onChange={() => {}} options={["Page View", "Lead", "Complete Registration"]} /></Field>
        <Field label="Google Analytics (GA4)"><input placeholder="G-XXXXXXX" className={inputCls} /></Field>
        <Field label="Google Tag Manager"><input placeholder="GTM-XXXXXX" className={inputCls} /></Field>
        <Field label="Google Ads · ID"><input placeholder="AW-000000000" className={inputCls} /></Field>
        <Field label="Google Ads · Label"><input placeholder="abcd1234" className={inputCls} /></Field>
      </div>
    </Card>,
  ];

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(backHref)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-breu/10 bg-white text-aco transition hover:text-breu"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
          {mode === "edit" ? "Editar campanha" : "Nova campanha"}
        </h1>
      </div>

      {/* Navegação: stepper (criar) ou abas (editar) */}
      {mode === "create" ? (
        <ol className="mt-6 flex items-center">
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full font-data text-sm font-medium transition",
                    i < idx ? "bg-sucesso text-white" : i === idx ? "bg-iris text-white shadow-iris" : "bg-bruma text-aco/50",
                  )}
                >
                  {i < idx ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("hidden text-sm md:inline", i === idx ? "font-medium text-breu" : "text-aco/50")}>{s}</span>
              </div>
              {i < SECTIONS.length - 1 && <span className={cn("mx-3 h-px flex-1 transition", i < idx ? "bg-sucesso/40" : "bg-breu/10")} />}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-breu/[0.08]">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              onClick={() => setIdx(i)}
              className={cn("relative shrink-0 px-4 py-2.5 text-sm font-medium transition", i === idx ? "text-breu" : "text-aco/55 hover:text-breu")}
            >
              {s}
              {i === idx && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-iris" />}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 hf-enter" key={idx}>
        {sections[idx]}
      </div>

      {/* Rodapé */}
      <div className="mt-6 flex items-center justify-between border-t border-breu/[0.08] pt-5">
        <button
          onClick={() => (mode === "create" && idx > 0 ? setIdx(idx - 1) : router.push(backHref))}
          className="inline-flex items-center gap-2 rounded-xl border border-breu/15 bg-white px-4 py-2.5 text-sm font-medium text-breu transition hover:border-aco/30"
        >
          <ArrowLeft className="h-4 w-4" /> {mode === "create" && idx > 0 ? "Voltar" : "Cancelar"}
        </button>

        {mode === "edit" ? (
          <button
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
          >
            <Check className="h-4 w-4" /> Salvar alterações
          </button>
        ) : idx < SECTIONS.length - 1 ? (
          <button
            onClick={() => canNext && setIdx(idx + 1)}
            disabled={!canNext}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition",
              canNext ? "bg-iris shadow-iris hover:-translate-y-0.5 hover:bg-iris-claro" : "cursor-not-allowed bg-iris/40",
            )}
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setDone(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
          >
            <Check className="h-4 w-4" /> Criar campanha
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

const inputCls =
  "w-full rounded-xl border border-breu/10 bg-white px-3.5 py-2.5 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 rounded-3xl border border-breu/[0.08] bg-white p-6 sm:p-7">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-breu">{label}</p>
      {hint && <p className="mb-2 mt-0.5 text-xs text-aco/55">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function ToggleInline({ on, setOn, labelOn, labelOff }: { on: boolean; setOn: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <button
      onClick={() => setOn(!on)}
      className="flex w-full items-center justify-between rounded-xl border border-breu/10 bg-bruma/40 px-3.5 py-2.5 text-left text-sm transition hover:border-iris/30"
    >
      <span className={cn("font-medium", on ? "text-breu" : "text-aco/70")}>{on ? labelOn : labelOff}</span>
      <span className={cn("relative h-6 w-11 rounded-full transition", on ? "bg-iris" : "bg-breu/15")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "cursor-pointer")}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
