"use client";

import Link from "next/link";
import { Power, RefreshCw, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { GruposProtecaoVitrine } from "@/components/painel/conectar/vitrine/grupos-protecao-vitrine";
import { NumeroSaudeVitrine } from "@/components/painel/conectar/vitrine/numero-saude-vitrine";
import { PerguntaPerfilNumero } from "@/components/painel/pergunta-perfil-numero";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { precisaParearDeNovo } from "@/lib/instance-disconnect-reason";
import type { NumeroPerfilDeclarado } from "@/lib/instances/numero-perfil";
import { activationLabel } from "@/lib/onboarding-steps";
import {
  cenaDaConexao,
  etiquetaDaConexao,
  telefoneNaVitrine,
  type InstanciaDaTela,
  type TomDaEtiqueta,
} from "@/lib/painel/conectar";

/** A instância como a tela precisa dela: o recorte da lib mais o nome. */
type InstanciaNaTela = InstanciaDaTela & { name: string };

type Props = {
  instancia: InstanciaNaTela | null;
  carregando: boolean;
  erro: string | null;
  /** Preenchido só quando o erro veio do gate de plano (402). */
  upgradeUrl: string | null;
  /** Sem instância e sem perfil declarado: a pergunta bloqueia o QR. */
  precisaPerfil: boolean;
  onAtualizar: () => void;
  onRefreshQr: () => void;
  onDesconectar: () => void;
  onEscolherPerfil: (perfil: NumeroPerfilDeclarado) => void;
};

/**
 * A casa do número na Vitrine Aberta (spec 12.6, aba Conexão).
 *
 * Três cenas na mesma rota, escolhidas por `cenaDaConexao`: o cartão do número
 * quando a sessão está aberta, o QR sem discurso quando ela caiu, e o roteiro
 * completo só para quem nunca pareou. O painel do QR deixa de ser Volt — na
 * Vitrine o letreiro é a única peça escura, e o código vive numa caixinha
 * Canvas como a palavra-chave do Relâmpago.
 *
 * Todo o estado (polling, criação da instância, ações) segue na page: aqui só
 * muda o desenho.
 */
export function ConectarVitrine({
  instancia,
  carregando,
  erro,
  upgradeUrl,
  precisaPerfil,
  onAtualizar,
  onRefreshQr,
  onDesconectar,
  onEscolherPerfil,
}: Props) {
  const cena = cenaDaConexao({ instancia, carregando, erro });

  if (cena === "consultando") {
    return (
      <div
        className="mx-auto max-w-[1000px] space-y-6 px-4 py-5 lg:px-8 lg:py-8"
        role="status"
        aria-live="polite"
        aria-label="Consultando o seu número"
      >
        <div className="pn-skeleton h-28 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
        <div className="pn-skeleton h-80 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-5 lg:px-8 lg:py-8">
      {cena === "sem-resposta" ? (
        <CenaSemResposta
          erro={erro}
          upgradeUrl={upgradeUrl}
          carregando={carregando}
          onAtualizar={onAtualizar}
        />
      ) : cena === "conectado" ? (
        <CenaDoNumero
          instancia={instancia}
          carregando={carregando}
          erro={erro}
          onAtualizar={onAtualizar}
          onDesconectar={onDesconectar}
        />
      ) : (
        <CenaDoPareamento
          instancia={instancia}
          reconexao={cena === "reconexao"}
          carregando={carregando}
          erro={erro}
          upgradeUrl={upgradeUrl}
          precisaPerfil={precisaPerfil}
          onAtualizar={onAtualizar}
          onRefreshQr={onRefreshQr}
          onDesconectar={onDesconectar}
          onEscolherPerfil={onEscolherPerfil}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A consulta respondeu que falhou: mostrar o motivo e a saída.               */
/* -------------------------------------------------------------------------- */

/**
 * O gate de plano (402) devolve erro e nenhuma instância. Desenhar isso como
 * esqueleto engolia a mensagem e o botão "Ver planos" para sempre — o cliente
 * ficava preso numa tela cinza no passo 2 do onboarding, sem nada em que clicar.
 */
function CenaSemResposta({
  erro,
  upgradeUrl,
  carregando,
  onAtualizar,
}: {
  erro: string | null;
  upgradeUrl: string | null;
  carregando: boolean;
  onAtualizar: () => void;
}) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3" data-testid="conectar-cabecalho">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Seu número</h1>
          <p className="mt-1 text-[14px] text-slate-600">
            Não deu para consultar o estado da conexão agora.
          </p>
        </div>
        <BotaoAtualizar carregando={carregando} onAtualizar={onAtualizar} />
      </header>

      <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8">
        <PlanLimitAlert
          message={erro}
          upgradeUrl={upgradeUrl}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-l-[3px] border-danger-700 bg-canvas-100 px-4 py-3 text-[14px] text-danger-700"
        />
        <p className="mt-4 text-13 text-slate-600">
          Seu número não foi desconectado por isto: só a consulta falhou. Tente atualizar em alguns
          instantes.
        </p>
      </section>

      <Link href="/painel" className="inline-block text-13 text-slate-600 hover:text-volt-950">
        ← Voltar ao painel
      </Link>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Conectado: a tela deixa de ser sobre parear e passa a ser sobre operar.     */
/* -------------------------------------------------------------------------- */

function CenaDoNumero({
  instancia,
  carregando,
  erro,
  onAtualizar,
  onDesconectar,
}: {
  instancia: InstanciaNaTela | null;
  carregando: boolean;
  erro: string | null;
  onAtualizar: () => void;
  onDesconectar: () => void;
}) {
  const etiqueta = etiquetaDaConexao({ instancia, carregando, erro });
  const telefone = telefoneNaVitrine(instancia?.phone);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3" data-testid="conectar-cabecalho">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Seu número</h1>
          <p className="mt-1 text-[14px] text-slate-600">
            Conectado e trabalhando. Aqui você acompanha o ritmo que protege ele de bloqueio.
          </p>
        </div>
        <BotaoAtualizar carregando={carregando} onAtualizar={onAtualizar} />
      </header>

      {/* O cartão do número: ficha em Paper, número em Mono 32, estado em etiqueta. */}
      <section
        className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8"
        data-testid="conectar-cartao"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-data flex items-center gap-3 text-[32px] leading-none tabular-nums text-volt-950">
            <span className="pn-ponto pn-ponto--conectado" aria-hidden="true" />
            {telefone ?? instancia?.name ?? "—"}
          </p>
          <Etiqueta texto={etiqueta.texto} tom={etiqueta.tom} />
        </div>

        {erro && (
          <p role="alert" className="mt-4 text-13 text-danger-700">
            {erro}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line-200 pt-5">
          {/* A saída deliberada. Até 31/08/2026 a ação existia na API sem nenhuma
              tela chamá-la — o lojista não tinha como trocar de número sozinho. */}
          <button
            type="button"
            onClick={onDesconectar}
            disabled={carregando}
            className="inline-flex h-10 items-center gap-2 text-[14px] text-danger-700 disabled:opacity-50"
          >
            <Power className="h-4 w-4" aria-hidden="true" /> Desconectar
          </button>
          <p className="text-13 text-slate-600">
            Os dados dos seus grupos ficam só na sua conta (LGPD).
          </p>
        </div>
      </section>

      <NumeroSaudeVitrine />
      <GruposProtecaoVitrine />

      <Link href="/painel" className="inline-block text-13 text-slate-600 hover:text-volt-950">
        ← Voltar ao painel
      </Link>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sem sessão: parear pela primeira vez ou reconectar.                         */
/* -------------------------------------------------------------------------- */

const INSTRUCOES = [
  "Abra o WhatsApp no seu celular",
  "Toque em Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Aponte a câmera para o QR Code ao lado",
];

function CenaDoPareamento({
  instancia,
  reconexao,
  carregando,
  erro,
  upgradeUrl,
  precisaPerfil,
  onAtualizar,
  onRefreshQr,
  onDesconectar,
  onEscolherPerfil,
}: {
  instancia: InstanciaNaTela | null;
  /** Já houve pareamento antes: isto é conserto, não boas-vindas. */
  reconexao: boolean;
  carregando: boolean;
  erro: string | null;
  upgradeUrl: string | null;
  precisaPerfil: boolean;
  onAtualizar: () => void;
  onRefreshQr: () => void;
  onDesconectar: () => void;
  onEscolherPerfil: (perfil: NumeroPerfilDeclarado) => void;
}) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3" data-testid="conectar-cabecalho">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">
            {reconexao ? "Reconecte seu WhatsApp" : "Vamos conectar seu WhatsApp"}
          </h1>
          <p className="mt-1 max-w-[52ch] text-[14px] text-slate-600">
            {reconexao
              ? "A sessão caiu. Escaneie o código uma vez e seus grupos voltam sozinhos."
              : "É o seu número de sempre, com seus grupos. Leva 2 minutos e nada técnico."}
          </p>
        </div>
        <BotaoAtualizar carregando={carregando} onAtualizar={onAtualizar} />
      </header>

      {/* O roteiro de três passos é material de onboarding: quem já pareou uma
          vez não está começando, está consertando. */}
      {!reconexao && <Passos />}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <section className="pn-card rounded-[var(--radius-control)] p-6 lg:col-span-6 lg:p-8">
          <h2 className="font-brand text-20 font-bold text-volt-950">Como conectar</h2>
          <ol className="mt-4 space-y-3">
            {INSTRUCOES.map((texto, i) => (
              <li key={texto} className="flex items-start gap-3">
                <span className="font-data flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-chip)] bg-canvas-100 text-12 tabular-nums text-volt-950">
                  {i + 1}
                </span>
                <span className="text-[14px] text-volt-950">{texto}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-start gap-3 border-t border-line-200 pt-5">
            <ShieldCheck className="h-5 w-5 shrink-0 text-cobalt-500" aria-hidden="true" />
            <p className="text-13 text-slate-600">
              Conexão segura e dentro da LGPD. Seus contatos são seus — desconectou, leva tudo.
            </p>
          </div>
        </section>

        <section className="pn-card rounded-[var(--radius-control)] p-6 lg:col-span-6 lg:p-8">
          {precisaPerfil && !instancia ? (
            <PerguntaPerfilNumero ocupado={carregando} onEscolher={onEscolherPerfil} />
          ) : (
            <PainelDoCodigo
              instancia={instancia}
              carregando={carregando}
              erro={erro}
              upgradeUrl={upgradeUrl}
              onRefreshQr={onRefreshQr}
              onDesconectar={onDesconectar}
            />
          )}
        </section>
      </div>

      {/* Com histórico, a saúde do número segue na tela mesmo sem sessão: é ela
          que mostra o aquecimento acumulado e o aviso dos 14 dias — justamente
          o que costuma explicar a queda. */}
      {reconexao && <NumeroSaudeVitrine />}

      <Link href="/painel" className="inline-block text-13 text-slate-600 hover:text-volt-950">
        {reconexao ? "← Voltar ao painel" : "Pular por agora"}
      </Link>
    </>
  );
}

/** O roteiro do primeiro acesso. Rótulos da fonte única (@/lib/onboarding-steps). */
function Passos() {
  const passos = [
    { n: 1, rotulo: activationLabel("connect"), atual: true },
    { n: 2, rotulo: activationLabel("groups"), atual: false },
    { n: 3, rotulo: activationLabel("campaign"), atual: false },
  ];

  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {passos.map((p, i) => (
        <li
          key={p.n}
          className="flex items-center gap-2"
          aria-current={p.atual ? "step" : undefined}
        >
          <span
            className={cn(
              "font-data flex h-6 w-6 items-center justify-center rounded-[var(--radius-chip)] text-12 tabular-nums",
              p.atual ? "bg-cobalt-500 text-paper-0" : "bg-canvas-100 text-slate-600",
            )}
          >
            {p.n}
          </span>
          <span className={cn("text-13", p.atual ? "text-volt-950" : "text-slate-600")}>
            {p.rotulo}
          </span>
          {i < passos.length - 1 && (
            <span className="ml-2 hidden h-px w-8 bg-line-200 sm:block" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * O código na caixinha Canvas.
 *
 * O QR em si continua desenhado em Volt sobre Paper: leitor de câmera precisa
 * do contraste cheio, e a caixinha é a moldura, não o fundo do código.
 */
function PainelDoCodigo({
  instancia,
  carregando,
  erro,
  upgradeUrl,
  onRefreshQr,
  onDesconectar,
}: {
  instancia: InstanciaNaTela | null;
  carregando: boolean;
  erro: string | null;
  upgradeUrl: string | null;
  onRefreshQr: () => void;
  onDesconectar: () => void;
}) {
  const etiqueta = etiquetaDaConexao({ instancia, carregando, erro });
  const qr = instancia?.qr_code ?? null;
  // Do motivo da queda, não do texto da etiqueta: mudar a cópia de
  // `etiquetaDaConexao` não pode apagar calado o aviso que segura o usuário
  // longe do `440 connectionReplaced`.
  const sessaoRemovida = precisaParearDeNovo(instancia?.metadata);

  return (
    <div className="flex flex-col items-center gap-4" data-testid="conectar-codigo">
      {/* Conectar um número é o passo 2 do onboarding: barrar aqui sem saída
          trava o cliente logo no começo. */}
      <PlanLimitAlert
        message={erro}
        upgradeUrl={upgradeUrl}
        className="flex w-full flex-wrap items-center justify-center gap-2 rounded-[var(--radius-control)] border-l-[3px] border-danger-700 bg-canvas-100 px-3 py-2 text-13 text-danger-700"
      />

      {/* `401` não é queda passageira: a sessão foi removida e só volta com um
          pareamento novo. Dizer isso evita o clique repetido em "atualizar",
          que é justamente o que substitui a conexão recém-aberta e prende o
          usuário no ciclo. */}
      {sessaoRemovida && (
        <p className="pn-aviso w-full">
          A conexão foi removida no celular. Escaneie o código <strong>uma vez</strong> e aguarde —
          pedir outro código no meio derruba o pareamento em andamento.
        </p>
      )}

      <div className="rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-4">
        {qr ? (
          <div className="rounded-[var(--radius-chip)] bg-paper-0 p-3">
            <QRCodeSVG
              value={qr}
              size={176}
              marginSize={2}
              bgColor="#FFFEFA"
              fgColor="#071923"
              title="QR Code WhatsApp"
              className="h-[176px] w-[176px]"
            />
          </div>
        ) : (
          <div className="flex h-[200px] w-[200px] flex-col items-center justify-center gap-3 rounded-[var(--radius-chip)] bg-paper-0">
            {/* Sem sinal de atividade, "Gerando código" parado é
                indistinguível de tela travada em rede lenta. */}
            {(carregando || etiqueta.tom === "andamento") && (
              <RefreshCw className="h-6 w-6 animate-spin text-slate-600" aria-hidden="true" />
            )}
            <span className="font-data px-4 text-center text-12 uppercase tracking-[0.06em] text-slate-600">
              {etiqueta.texto}
            </span>
          </div>
        )}
      </div>

      <Etiqueta texto={etiqueta.texto} tom={etiqueta.tom} />

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onRefreshQr}
          disabled={carregando}
          className="inline-flex h-10 items-center gap-2 text-13 text-cobalt-500 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", carregando && "animate-spin")} aria-hidden="true" />
          Gerar outro código
        </button>

        {/* Saída para quando o pareamento entra em ciclo (a sessão abre e cai
            sozinha): encerra a sessão na Evolution e deixa o próximo QR começar
            limpo. Sem instância não há o que desconectar. */}
        {instancia && (
          <button
            type="button"
            onClick={onDesconectar}
            disabled={carregando}
            className="inline-flex h-10 items-center gap-2 text-13 text-danger-700 disabled:opacity-50"
          >
            <Power className="h-4 w-4" aria-hidden="true" /> Desconectar
          </button>
        )}
      </div>

      <p className="text-12 text-slate-600">O código expira em 60s e outro vem sozinho.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Peças pequenas.                                                            */
/* -------------------------------------------------------------------------- */

/** Cor não é o único sinal: o texto diz o estado por extenso. */
const TOM: Record<TomDaEtiqueta, string> = {
  conectado: "text-success-700",
  andamento: "text-cobalt-500",
  espera: "text-slate-600",
  atencao: "text-danger-700",
  indefinido: "text-slate-600",
};

function Etiqueta({ texto, tom }: { texto: string; tom: TomDaEtiqueta }) {
  return (
    <span className={cn("pn-chip", TOM[tom])} data-testid="conectar-etiqueta">
      {texto}
    </span>
  );
}

function BotaoAtualizar({
  carregando,
  onAtualizar,
}: {
  carregando: boolean;
  onAtualizar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAtualizar}
      disabled={carregando}
      className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-volt-950 disabled:opacity-50"
    >
      <RefreshCw className={cn("h-4 w-4", carregando && "animate-spin")} aria-hidden="true" />
      {carregando ? "Verificando…" : "Atualizar"}
    </button>
  );
}
