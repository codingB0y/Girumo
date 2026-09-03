"use client";

import { useState } from "react";
import { EVENTOS_PADRAO } from "@/lib/campaigns/settings";
import type { IntegracoesPublicas } from "@/app/api/campanhas/apresenta";

/**
 * Aba "Integrações" das configurações da campanha.
 *
 * O token da API de Conversões nunca chega aqui — o GET só devolve
 * `capi_token_set` e os 4 últimos. Por isso `capi_token_novo` é separado:
 * `undefined` = o lojista não mexeu (o servidor mantém), `""` = ele pediu para
 * apagar, qualquer outra coisa = valor novo.
 */
export type IntegracoesFormValue = IntegracoesPublicas & { capi_token_novo?: string };

/** `recebendo eventos` só quando dá para MEDIR de verdade: pixel + token. */
export function etiquetaMeta(v: IntegracoesFormValue): "recebendo eventos" | "sem token" | "não configurado" {
  if (!v.meta.pixel_id) return "não configurado";
  const temToken = v.capi_token_novo === undefined ? v.meta.capi_token_set : v.capi_token_novo.length > 0;
  return temToken ? "recebendo eventos" : "sem token";
}

const CAMPO =
  "mt-1 w-full rounded-xl border border-aco/15 bg-white px-3 py-2 text-sm text-volt-950 outline-none transition-colors duration-[160ms] focus:border-cobalt-500";
const DICA = "mt-1 text-xs text-aco/60";
const ROTULO = "text-sm font-medium text-volt-950";

function Card({ titulo, etiqueta, children }: { titulo: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-aco/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-volt-950">{titulo}</h3>
        <span className="pn-etiqueta bg-poco text-aco/70">{etiqueta}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function IntegracoesForm({
  value,
  onChange,
  onTestar,
  podeTestar,
}: {
  value: IntegracoesFormValue;
  onChange: (v: IntegracoesFormValue) => void;
  onTestar: () => Promise<{ ok: boolean; mensagem: string }>;
  /** Falso enquanto houver alteração não salva: o teste lê o BANCO, não a tela. */
  podeTestar: boolean;
}) {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const meta = (p: Partial<IntegracoesFormValue["meta"]>) => onChange({ ...value, meta: { ...value.meta, ...p } });
  const personalizado = !(EVENTOS_PADRAO as readonly string[]).includes(value.meta.evento);

  return (
    <div className="space-y-4">
      <Card titulo="Meta (Facebook e Instagram)" etiqueta={etiquetaMeta(value)}>
        <label className="block">
          <span className={ROTULO}>ID do pixel</span>
          <input
            className={CAMPO}
            value={value.meta.pixel_id}
            inputMode="numeric"
            placeholder="1234567890"
            onChange={(e) => meta({ pixel_id: e.target.value.trim() })}
          />
          <p className={DICA}>Só números. Está no Gerenciador de Eventos, ao lado do nome do pixel.</p>
        </label>

        <label className="block">
          <span className={ROTULO}>Evento de conversão</span>
          <select
            className={CAMPO}
            value={personalizado ? "__outro" : value.meta.evento}
            onChange={(e) => meta({ evento: e.target.value === "__outro" ? "" : e.target.value })}
          >
            {EVENTOS_PADRAO.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
            <option value="__outro">Outro nome…</option>
          </select>
          {personalizado && (
            <input
              className={CAMPO}
              value={value.meta.evento}
              placeholder="EntrouNoGrupo"
              aria-label="Nome do evento personalizado"
              onChange={(e) => meta({ evento: e.target.value.trim() })}
            />
          )}
          <p className={DICA}>É o evento que a Meta usa para otimizar o anúncio. Na dúvida, deixe Lead.</p>
        </label>

        <label className="block">
          <span className={ROTULO}>Token da API de Conversões</span>
          {/*
            `autoComplete="off"` NÃO segura o Chrome num campo `type="password"`:
            em 02/09/2026 ele preencheu o e-mail da conta por cima de um token
            já guardado. `new-password` é o valor que os navegadores respeitam,
            e o `name` fora do vocabulário de credencial tira o campo da
            heurística. O servidor recusa o que não parecer token de qualquer
            forma — isto aqui é para o acidente não chegar lá.
          */}
          <input
            className={CAMPO}
            type="password"
            name="capi-token"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            placeholder={
              value.meta.capi_token_set ? `Guardado · termina em ${value.meta.capi_token_last4}` : "Cole o token aqui"
            }
            value={value.capi_token_novo ?? ""}
            onChange={(e) => onChange({ ...value, capi_token_novo: e.target.value.trim() })}
          />
          <p className={DICA}>
            Sem ele, quem bloqueia rastreamento no celular some da sua conta.
            {value.meta.capi_token_set ? " Deixe em branco para manter o token atual." : ""}
          </p>
          {value.meta.capi_token_set && value.capi_token_novo !== "" && (
            <button
              type="button"
              className="mt-2 text-xs text-erro underline"
              onClick={() => onChange({ ...value, capi_token_novo: "" })}
            >
              Apagar token guardado
            </button>
          )}
          {value.capi_token_novo === "" && value.meta.capi_token_set && (
            <p className="mt-2 text-xs text-erro">O token será apagado ao salvar.</p>
          )}
        </label>

        <label className="block">
          <span className={ROTULO}>Código de teste</span>
          <input className={CAMPO} value={value.meta.test_code} onChange={(e) => meta({ test_code: e.target.value.trim() })} />
          <p className={DICA}>Opcional. Copie da aba &quot;Testar eventos&quot; do Gerenciador para conferir a ligação.</p>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={testando || !podeTestar}
            className="rounded-xl bg-poco px-3 py-2 text-sm font-medium text-volt-950 transition-colors duration-[160ms] hover:bg-cobalt-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={async () => {
              setTestando(true);
              setResultado(null);
              try {
                setResultado(await onTestar());
              } finally {
                setTestando(false);
              }
            }}
          >
            {testando ? "Enviando…" : "Enviar teste"}
          </button>
          {!podeTestar && <span className="text-xs text-aco/60">Salve as alterações antes de testar.</span>}
          {resultado && (
            <span role="status" className={`text-xs ${resultado.ok ? "text-sucesso" : "text-erro"}`}>
              {resultado.mensagem}
            </span>
          )}
        </div>

        <p className="rounded-xl bg-poco px-3 py-2 text-xs text-aco/70">
          Lead registrado mesmo com deep link — o evento sai antes de o WhatsApp abrir.
        </p>
      </Card>

      <Card titulo="Google Analytics 4" etiqueta={value.ga4.id ? "recebendo eventos" : "não configurado"}>
        <label className="block">
          <span className={ROTULO}>ID de medição (GA4)</span>
          <input
            className={CAMPO}
            value={value.ga4.id}
            placeholder="G-XXXXXXX"
            onChange={(e) => onChange({ ...value, ga4: { id: e.target.value.trim() } })}
          />
          <p className={DICA}>Registra um generate_lead a cada entrada.</p>
        </label>
      </Card>

      <Card
        titulo="Google Ads"
        etiqueta={value.google_ads.id && value.google_ads.label ? "recebendo eventos" : "não configurado"}
      >
        <label className="block">
          <span className={ROTULO}>ID de conversão (Google Ads)</span>
          <input
            className={CAMPO}
            value={value.google_ads.id}
            placeholder="AW-000000000"
            onChange={(e) => onChange({ ...value, google_ads: { ...value.google_ads, id: e.target.value.trim() } })}
          />
        </label>
        <label className="block">
          <span className={ROTULO}>Rótulo de conversão</span>
          <input
            className={CAMPO}
            value={value.google_ads.label}
            onChange={(e) => onChange({ ...value, google_ads: { ...value.google_ads, label: e.target.value.trim() } })}
          />
          <p className={DICA}>Os dois vêm juntos quando você cria a conversão no Google Ads. Sem o rótulo não conta.</p>
        </label>
      </Card>
    </div>
  );
}
