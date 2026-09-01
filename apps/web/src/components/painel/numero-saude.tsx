"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Flame, ShieldCheck, Smartphone, Timer } from "lucide-react";
import { LINKED_DEVICE_TIMEOUT_DAYS, type NumberHealth } from "@/lib/instance-health";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;

/**
 * Saúde do número — o anti-ban deixa de ser invisível.
 *
 * Todo número aqui vem do banco (RPC `instance_health`), que é a mesma fonte
 * que o `claim_send_commands` usa para decidir o envio. Nada é estimado na
 * tela: se aparece "teto de hoje 41", 41 é o teto que o claim vai aplicar.
 */
export function NumeroSaude() {
  const [numbers, setNumbers] = useState<NumberHealth[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/instances/health");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { numbers?: NumberHealth[] };
      setNumbers(json.numbers ?? []);
      setFailed(false);
    } catch {
      // Falha aqui não pode assustar: é painel informativo, não o envio.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // O criterio e HISTORICO, nao sessao aberta.
  //
  // Antes o bloco sumia quando nenhum numero estava conectado — ou seja,
  // exatamente na hora em que o numero caiu ou foi bloqueado, que e a unica
  // hora em que o lojista precisa dele. Mas o outro extremo tambem e errado:
  // mostrar rampa de aquecimento para quem criou a instancia e nunca escaneou
  // o QR (essa linha ja existe em `instances`, entao "tem linha" nao serve de
  // gate). `everConnected` separa os dois casos.
  const comHistorico = (numbers ?? []).filter((n) => n.everConnected);
  if (failed || (numbers !== null && comHistorico.length === 0)) return null;

  return (
    <section aria-labelledby="saude-titulo" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="saude-titulo" className="font-display text-xl font-bold tracking-[-0.02em] text-volt-950">
          Saúde do número
        </h2>
        <span className="font-data text-[11px] uppercase tracking-wider text-aco/50">
          atualiza sozinho
        </span>
      </div>
      <p className="font-editorial mt-1 text-[17px] italic text-ardosia">
        O ritmo que protege seu WhatsApp de bloqueio — em número, não em promessa.
      </p>

      <div className="mt-4 grid gap-4">
        {numbers === null ? (
          <div className="pn-card pn-skeleton h-[180px] rounded-2xl" aria-hidden="true" />
        ) : (
          comHistorico.map((n) => <CartaoNumero key={n.instanceId} health={n} />)
        )}
      </div>

      <RegraDosQuatorzeDias />
    </section>
  );
}

function CartaoNumero({ health }: { health: NumberHealth }) {
  const restante = Math.max(0, health.dailyCap - health.usedToday);

  return (
    <article className="pn-card rounded-2xl p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-aco/50" aria-hidden="true" />
          <span className="font-data text-sm text-volt-950">
            {health.phone ? `+${health.phone}` : "Número conectado"}
          </span>
        </div>
        <EtiquetaTom health={health} />
      </header>

      {!health.connected && <AvisoDesconectado />}

      {health.silence?.shouldWarn && <AvisoSilencio dias={health.silence.daysLeft} />}

      {health.pausedSeconds > 0 && (
        <p role="status" className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">Envios pausados por {health.pausedSeconds}s.</strong> O
          número teve falhas seguidas e o sistema recuou sozinho para não insistir — é a proteção
          funcionando. Volta ao normal automaticamente.
        </p>
      )}

      <div className={cn("mt-5 grid gap-5 sm:grid-cols-2", !health.connected && "hidden")}>
        <div>
          <Rotulo icone={<Flame className="h-3.5 w-3.5" aria-hidden="true" />}>
            {health.graduated ? "Aquecimento concluído" : `Dia ${health.warmupDay} de aquecimento`}
          </Rotulo>
          <p className="font-display mt-1.5 text-[28px] font-extrabold leading-none tracking-[-0.03em] text-volt-950">
            {health.usedToday}
            <span className="text-aco/40"> / {health.dailyCap}</span>
          </p>
          <p className="mt-1 text-sm text-ardosia">mensagens hoje · restam {restante}</p>
          <BarraUso ratio={health.usedRatio} usadas={health.usedToday} teto={health.dailyCap} />
          <p className="mt-2 text-[13px] leading-relaxed text-aco/70">
            {health.graduated
              ? "Seu número já passou pela rampa e opera no teto cheio."
              : "Número novo que dispara muito é o que o WhatsApp bloqueia. O teto sobe sozinho a cada dia."}
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
            nota="teto de 120/h"
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
 * Sem sessao nao ha ritmo de envio para mostrar — ha um numero parado.
 *
 * O cartao continua na tela de proposito: sumir levava junto o historico e a
 * unica explicacao do que fazer, no momento em que o lojista mais precisa das
 * duas coisas.
 */
function AvisoDesconectado() {
  return (
    <div role="alert" className="mt-4 flex gap-3 rounded-xl bg-red-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-red-900">
        <strong className="font-semibold">Este número está desconectado.</strong> Nenhuma campanha
        sai por ele enquanto estiver assim. Pareie de novo pelo QR Code acima — o aquecimento e o
        histórico de envios continuam de onde pararam.
      </p>
    </div>
  );
}

function EtiquetaTom({ health }: { health: NumberHealth }) {
  const map = {
    ok: { texto: "Saudável", classe: "bg-emerald-500/12 text-emerald-800" },
    atencao: { texto: "Atenção", classe: "bg-amber-500/15 text-amber-900" },
    risco: { texto: "Requer ação", classe: "bg-red-500/12 text-red-800" },
  } as const;
  // Desconectado tambem cai em "risco", mas "Requer ação" nao diz o que houve.
  const { texto, classe } = health.connected
    ? map[health.tone]
    : { texto: "Desconectado", classe: map.risco.classe };
  return <span className={cn("pn-etiqueta", classe)}>{texto}</span>;
}

function AvisoSilencio({ dias }: { dias: number }) {
  return (
    <div role="alert" className="mt-4 flex gap-3 rounded-xl bg-red-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-red-900">
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
    <div className="pn-poco mt-4 rounded-2xl p-5">
      <h3 className="font-data text-[11px] uppercase tracking-wider text-aco/60">
        Duas regras do WhatsApp que ninguém te conta
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-semibold text-volt-950">
            O celular precisa aparecer a cada {LINKED_DEVICE_TIMEOUT_DAYS} dias
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-ardosia">
            O Girumo entra como aparelho conectado, igual ao WhatsApp Web. Se o seu celular passar{" "}
            {LINKED_DEVICE_TIMEOUT_DAYS} dias sem abrir o WhatsApp, o app desconecta todos os
            aparelhos de uma vez. A gente avisa antes de chegar lá.
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-volt-950">
            São 4 vagas de aparelho, e nós usamos 1
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-ardosia">
            O WhatsApp permite 4 aparelhos conectados. Se você abrir o WhatsApp Web em vários
            computadores, a vaga mais antiga cai — e pode ser a nossa. Desconecte o que não usa em{" "}
            <span className="font-data">Aparelhos conectados</span>, no app.
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Rotulo({ children, icone }: { children: React.ReactNode; icone: React.ReactNode }) {
  return (
    <span className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-aco/60">
      {icone}
      {children}
    </span>
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
      <dt className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-aco/60">
        {icone}
        {rotulo}
      </dt>
      <dd className="font-display mt-1 text-lg font-bold tracking-[-0.02em] text-volt-950">{valor}</dd>
      <dd className="text-[12px] leading-snug text-aco/60">{nota}</dd>
    </div>
  );
}

function BarraUso({ ratio, usadas, teto }: { ratio: number; usadas: number; teto: number }) {
  const pct = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={usadas}
      aria-valuemin={0}
      aria-valuemax={teto}
      aria-label={`${usadas} de ${teto} mensagens usadas hoje`}
      className="pn-poco mt-3 h-2 overflow-hidden rounded-full"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-[320ms] ease-[var(--ease-fluxo)]",
          pct >= 90 ? "bg-amber-500" : "bg-cobalt-500",
        )}
        style={{ width: `${Math.max(pct, usadas > 0 ? 3 : 0)}%` }}
      />
    </div>
  );
}
