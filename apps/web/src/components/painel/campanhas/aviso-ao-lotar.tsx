"use client";

import Link from "next/link";
import { AVISO_AO_LOTAR_MAX, ultimosAvisos } from "@/lib/campaigns/aviso-ao-lotar";
import { conferidoHa } from "@/lib/painel/grupos";
import { estadosFrescos, useEstadosDaCampanha } from "@/lib/painel/use-estados-da-campanha";

export type AvisoAoLotarValor = { ligado: boolean; texto: string };

type Props = {
  value: AvisoAoLotarValor;
  onChange: (v: AvisoAoLotarValor) => void;
  /** Slug salvo da campanha, para ler os estados dos grupos. `null` = ainda não carregou. */
  slug: string | null;
  /** `aviso_ao_lotar_desde` gravado. `null` = aviso desligado no banco: sem lista. */
  desde: string | null;
};

/** 16px: abaixo disso o iOS dá zoom ao focar. */
const CAMPO =
  "block w-full resize-y rounded-[10px] border border-volt-950/10 bg-poco px-3.5 py-2.5 text-[16px] leading-relaxed text-volt-950 outline-none placeholder:text-aco focus:border-cobalt-500/50 focus:bg-papel";

/**
 * "Aviso ao lotar" (spec 2026-10-10 D10, mockup Automação): uma mensagem postada
 * NO GRUPO, uma vez, quando ele ganha a marca de lotado. Não é boas-vindas: quem
 * entra depois não recebe nada. Controlado de fora, como o `EntradaForm`: o
 * formulário pai salva tudo junto no "Salvar alterações".
 */
export function AvisoAoLotar({ value, onChange, slug, desde }: Props) {
  const semTexto = value.ligado && value.texto.trim() === "";

  return (
    <section aria-labelledby="aviso-ao-lotar-titulo" className="flex flex-col gap-3.5">
      <h2 id="aviso-ao-lotar-titulo" className="text-[16px] font-semibold text-volt-950">
        Aviso ao lotar
      </h2>
      <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-volt-950">
        <input
          type="checkbox"
          checked={value.ligado}
          onChange={(e) => onChange({ ...value, ligado: e.target.checked })}
          aria-describedby="aviso-ao-lotar-ajuda"
          className="h-[18px] w-[18px] shrink-0 accent-cobalt-500"
        />
        Mandar uma mensagem quando um grupo lotar
      </label>

      {value.ligado && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="aviso-ao-lotar-texto" className="text-13 text-aco">
            Mensagem
          </label>
          <textarea
            id="aviso-ao-lotar-texto"
            rows={4}
            value={value.texto}
            // `.length` (UTF-16), o mesmo que o servidor mede com AVISO_AO_LOTAR_MAX.
            maxLength={AVISO_AO_LOTAR_MAX}
            onChange={(e) => onChange({ ...value, texto: e.target.value })}
            placeholder="Ex.: Grupo lotado! Amanhã às 9h começam as novidades por aqui."
            aria-describedby="aviso-ao-lotar-ajuda"
            className={CAMPO}
          />
          <p className="font-data text-right text-12 tabular-nums text-aco">
            {value.texto.length}/{AVISO_AO_LOTAR_MAX}
          </p>
        </div>
      )}

      {/* Fora do bloco acima: a região viva já existe no DOM antes do texto aparecer, senão o leitor
          de tela pode não anunciar. Vazia fica sr-only (fora do fluxo, sem o gap da seção); com
          texto, -mt-2 a encosta no contador como antes. */}
      <p aria-live="polite" className={semTexto ? "-mt-2 text-13 text-alerta" : "sr-only"}>
        {semTexto ? "Sem mensagem, o aviso fica desligado." : ""}
      </p>

      <p id="aviso-ao-lotar-ajuda" className="text-13 leading-relaxed text-aco">
        Sai no próprio grupo, uma vez, na hora em que ele ganha a marca de lotado (sozinho, ao passar de 95%,
        ou pelo botão). Se você reabrir e ele lotar de novo, não repete. Grupos que já estavam lotados antes de
        ligar o aviso não recebem. Não é boas-vindas: quem entrar depois não recebe nada. Só sai em grupo onde
        o seu número é admin.
      </p>

      {desde && slug && <UltimosAvisos slug={slug} desde={desde} />}
    </section>
  );
}

/**
 * Os últimos cinco grupos avisados, pela mesma leitura de estados das abas (PR 4). Sem "enviado":
 * o carimbo é gravado mesmo quando o disparo falha por falta de número (spec §5.6), então a linha
 * diz só quando, e o resultado fica em Disparos.
 */
function UltimosAvisos({ slug, desde }: { slug: string; desde: string }) {
  const { carga } = useEstadosDaCampanha(slug, null);
  const estados = estadosFrescos(carga);
  const agora = new Date();
  const avisos = estados && estados !== "erro" ? ultimosAvisos(estados.grupos, desde) : [];

  return (
    <div className="flex flex-col border-t border-volt-950/[0.07] pt-3">
      <h3 className="mb-1.5 text-sm font-semibold text-volt-950">Últimos avisos</h3>
      {estados === null ? (
        <p role="status" className="text-13 text-aco">
          Carregando…
        </p>
      ) : estados === "erro" ? (
        <p role="alert" className="text-13 text-alerta">
          Não deu para carregar os últimos avisos.
        </p>
      ) : avisos.length === 0 ? (
        <p className="text-13 text-aco">Nenhum aviso ainda.</p>
      ) : (
        <ul>
          {avisos.map((g) => (
            <li
              key={g.groupId}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-volt-950/[0.07] py-2 last:border-b-0"
            >
              <span className="truncate text-sm text-volt-950">
                {g.nome}
                {g.lotadoPor === "manual" && <span className="text-13 text-aco"> · marcado à mão</span>}
              </span>
              <span className="text-13 text-aco">{conferidoHa(g.avisoLotouEm, agora)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-13 text-aco">
        O resultado de cada envio fica em{" "}
        <Link href="/painel/disparos" className="font-medium text-cobalt-500 underline-offset-2 hover:underline">
          Disparos
        </Link>
        .
      </p>
    </div>
  );
}
