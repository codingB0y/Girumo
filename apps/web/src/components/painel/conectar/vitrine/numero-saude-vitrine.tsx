"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Flame, ShieldCheck, Smartphone, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import { LINKED_DEVICE_TIMEOUT_DAYS, type NumberHealth } from "@/lib/instance-health";
import { etiquetaDoTom, mostraSaudeDoNumero, numerosComHistorico, usoDeHoje } from "@/lib/painel/saude-numero";

const REFRESH_MS = 30_000;

/**
 * Saúde do número na Vitrine Aberta — o anti-ban deixa de ser invisível.
 *
 * Mesma lógica e mesma copy da casca antiga; o que muda é a paleta. O original
 * usava cores Tailwind cruas (`bg-emerald-500/12`, `bg-red-500/10`,
 * `text-amber-900`) que não existem na Vitrine, então o bloco aparecia dentro
 * da tela nova com o vocabulário visual da tela velha.
 *
 * Todo número vem do banco (RPC `instance_health`), a mesma fonte que o
 * `claim_send_commands` usa para decidir o envio: se aparece "teto de hoje 41",
 * 41 é o teto que o claim vai aplicar.
 */
export function NumeroSaudeVitrine() {
  const [numeros, setNumeros] = useState<NumberHealth[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/instances/health");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { numbers?: NumberHealth[] };
      setNumeros(json.numbers ?? []);
      setFalhou(false);
    } catch {
      // Falha aqui não pode assustar: é painel informativo, não o envio.
      setFalhou(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [carregar]);

  if (!mostraSaudeDoNumero(numeros, falhou)) return null;
  const comHistorico = numerosComHistorico(numeros);

  return (
    <section aria-labelledby="saude-titulo" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="saude-titulo" className="font-brand text-20 font-bold text-volt-950">
          Saúde do número
        </h2>
        <span className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">
          atualiza sozinho
        </span>
      </div>
      <p className="mt-1 text-15 text-slate-600">
        O ritmo que protege seu WhatsApp de bloqueio — em número, não em promessa.
      </p>

      <div className="mt-4 grid gap-3">
        {numeros === null ? (
          <div
            className="pn-skeleton h-[180px] rounded-[var(--radius-control)]"
            data-testid="painel-skeleton"
            aria-hidden="true"
          />
        ) : (
          comHistorico.map((n) => <CartaoNumero key={n.instanceId} health={n} />)
        )}
      </div>

      <RegraDosQuatorzeDias />
    </section>
  );
}

function CartaoNumero({ health }: { health: NumberHealth }) {
  const etiqueta = etiquetaDoTom(health);
  const uso = usoDeHoje(health);

  return (
    <article className="pn-card rounded-[var(--radius-control)] p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-slate-600" aria-hidden="true" />
          <span className="font-data text-15 text-volt-950">
            {health.phone ? `+${health.phone}` : "Número conectado"}
          </span>
        </span>
        <span
          className={cn(
            "pn-chip",
            etiqueta.tom === "risco" && "pn-chip--line",
            etiqueta.tom === "atencao" && "pn-chip--line",
          )}
        >
          {etiqueta.texto}
        </span>
      </header>

      {!health.connected && <AvisoDesconectado />}
      {health.silence?.shouldWarn && <AvisoSilencio dias={health.silence.daysLeft} />}

      {health.pausedSeconds > 0 && (
        <p role="status" className="pn-aviso mt-4 rounded-[var(--radius-control)] px-4 py-3">
          <strong className="font-semibold">Envios pausados por {health.pausedSeconds}s.</strong> O
          número teve falhas seguidas e o sistema recuou sozinho para não insistir — é a proteção
          funcionando. Volta ao normal automaticamente.
        </p>
      )}

      <div className={cn("mt-5 grid gap-5 sm:grid-cols-2", !health.connected && "hidden")}>
        <div>
          <span className="pn-chip">
            {health.perfil === "veterano"
              ? "Número veterano"
              : `Número novo · dia ${health.warmupDay} de 7`}
          </span>
          <p className="font-data mt-2 text-28 tabular-nums text-volt-950">
            {health.usedToday}
            <span className="text-slate-600"> / {health.dailyCap}</span>
          </p>
          <p className="mt-1 text-13 text-slate-600">
            mensagens hoje · restam {uso.restante}
          </p>
          <BarraUso uso={uso} usadas={health.usedToday} teto={health.dailyCap} />
          <p className="mt-2 text-13 text-slate-600">
            {health.perfil === "veterano"
              ? `Até ${health.dailyCap} mensagens por dia e ${health.hourlyCap} por hora, calculado pelos seus ${health.adminGroups} grupos com gente. Enviamos 1 a cada 5 s para parecer uso humano.`
              : `Número novo que dispara muito é o que o WhatsApp bloqueia. Hoje o teto é ${health.dailyCap}; ele sobe sozinho a cada dia até o 7º.`}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 self-start sm:gap-5">
          <Metrica
            icone={<Timer className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Próximo envio"
            valor={health.nextSendInSeconds > 0 ? `${health.nextSendInSeconds}s` : "livre"}
            nota="intervalo variável entre mensagens"
          />
          <Metrica
            icone={<Activity className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Última hora"
            valor={`${health.sentLastHour}`}
            nota={
              health.pausedSeconds > 60
                ? `Pausado ${Math.ceil(health.pausedSeconds / 60)} min: o WhatsApp pediu para desacelerar.`
                : `teto de ${health.hourlyCap}/h`
            }
          />
          <Metrica
            icone={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Falhas em 24h"
            valor={`${health.failures24h}`}
            nota={health.failures24h === 0 ? "nenhuma — tudo entregue" : "reenvio automático"}
          />
          <Metrica
            icone={<Flame className="h-3.5 w-3.5" aria-hidden="true" />}
            rotulo="Teto do dia"
            valor={`${health.dailyCap}`}
            nota={health.graduated ? "teto cheio" : "sobe amanhã"}
          />
        </dl>
      </div>
    </article>
  );
}

/**
 * Sem sessão não há ritmo de envio para mostrar — há um número parado.
 *
 * O cartão continua na tela de propósito: sumir levava junto o histórico e a
 * única explicação do que fazer, no momento em que o lojista mais precisa das
 * duas coisas.
 */
function AvisoDesconectado() {
  return (
    <div role="alert" className="pn-aviso mt-4 flex gap-3 rounded-[var(--radius-control)] px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Este número está desconectado.</strong> Nenhuma campanha
        sai por ele enquanto estiver assim. Pareie de novo pelo QR Code acima — o aquecimento e o
        histórico de envios continuam de onde pararam.
      </p>
    </div>
  );
}

function AvisoSilencio({ dias }: { dias: number }) {
  return (
    <div role="alert" className="pn-aviso mt-4 flex gap-3 rounded-[var(--radius-control)] px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
      <p>
        <strong className="font-semibold">
          {dias > 0
            ? `Faltam ~${dias} dias para o WhatsApp desconectar tudo.`
            : "Risco de desconexão agora."}
        </strong>{" "}
        Não vemos atividade neste número há dias. Se o celular estiver desligado, sem internet ou com
        o WhatsApp desinstalado, o app derruba todos os aparelhos conectados ao completar{" "}
        {LINKED_DEVICE_TIMEOUT_DAYS} dias — e o Girumo para junto, sem erro nenhum.{" "}
        <strong className="font-semibold">Abra o WhatsApp no celular hoje</strong> para zerar essa
        contagem.
      </p>
    </div>
  );
}

/** O que ninguém explica ao lojista — e que derruba a operação sem dar erro. */
function RegraDosQuatorzeDias() {
  return (
    <div className="mt-4 rounded-[var(--radius-control)] bg-canvas-100 p-5">
      <h3 className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">
        Duas regras do WhatsApp que ninguém te conta
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-15 font-semibold text-volt-950">
            O celular precisa aparecer a cada {LINKED_DEVICE_TIMEOUT_DAYS} dias
          </dt>
          <dd className="mt-1 text-13 text-slate-600">
            O Girumo entra como aparelho conectado, igual ao WhatsApp Web. Se o seu celular passar{" "}
            {LINKED_DEVICE_TIMEOUT_DAYS} dias sem abrir o WhatsApp, o app desconecta todos os
            aparelhos de uma vez. A gente avisa antes de chegar lá.
          </dd>
        </div>
        <div>
          <dt className="text-15 font-semibold text-volt-950">
            São 4 vagas de aparelho, e nós usamos 1
          </dt>
          <dd className="mt-1 text-13 text-slate-600">
            O WhatsApp permite 4 aparelhos conectados. Se você abrir o WhatsApp Web em vários
            computadores, a vaga mais antiga cai — e pode ser a nossa. Desconecte o que não usa em{" "}
            <span className="font-data">Aparelhos conectados</span>, no app.
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Metrica({
  icone,
  rotulo,
  valor,
  nota,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  nota: string;
}) {
  return (
    <div>
      <dt className="font-data inline-flex items-center gap-1.5 text-12 uppercase tracking-[0.06em] text-slate-600">
        {icone}
        {rotulo}
      </dt>
      <dd className="font-data mt-1 text-20 tabular-nums text-volt-950">{valor}</dd>
      <dd className="text-12 leading-snug text-slate-600">{nota}</dd>
    </div>
  );
}

function BarraUso({
  uso,
  usadas,
  teto,
}: {
  uso: { proporcao: number; perto: boolean };
  usadas: number;
  teto: number;
}) {
  return (
    <span
      role="progressbar"
      aria-valuenow={usadas}
      aria-valuemin={0}
      aria-valuemax={teto}
      aria-label={`${usadas} de ${teto} mensagens usadas hoje`}
      className={cn(
        "pn-etiqueta-preco__barra mt-3",
        uso.perto && "pn-etiqueta-preco__barra--quase",
      )}
      style={{ ["--p" as string]: uso.proporcao }}
    />
  );
}
