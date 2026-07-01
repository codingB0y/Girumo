import Link from "next/link";
import { Check, Smartphone, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "Conectar WhatsApp — HubFlow" };

const STEPS = [
  { n: 1, label: "Conectar número", active: true, done: false },
  { n: 2, label: "Grupos entram", active: false, done: false },
  { n: 3, label: "Primeira campanha", active: false, done: false },
];

const INSTRUCTIONS = [
  "Abra o WhatsApp no seu celular",
  "Toque em Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Aponte a câmera para o QR Code ao lado",
];

export default function PainelConectar() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10 sm:px-6">
      {/* Boas-vindas */}
      <div className="text-center">
        <span className="font-data inline-flex items-center gap-2 rounded-full bg-bruma px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-aco/60">
          <Zap className="h-3 w-3 text-iris" /> Primeiro acesso
        </span>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.035em]">
          Vamos conectar seu WhatsApp
        </h1>
        <p className="mx-auto mt-2 max-w-md text-aco">
          É o seu número de sempre, com seus grupos. Leva 2 minutos e nada técnico.
        </p>
      </div>

      {/* Stepper */}
      <ol className="mx-auto mt-8 flex max-w-xl items-center">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full font-data text-sm font-medium",
                  s.active ? "bg-iris text-white shadow-iris" : "bg-bruma text-aco/50",
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : s.n}
              </span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  s.active ? "font-medium text-breu" : "text-aco/50",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="mx-3 h-px flex-1 bg-breu/10" />}
          </li>
        ))}
      </ol>

      {/* Card de conexão */}
      <div className="mt-10 grid gap-6 overflow-hidden rounded-3xl border border-breu/[0.08] bg-white md:grid-cols-2">
        {/* Instruções */}
        <div className="p-7 sm:p-9">
          <h2 className="font-display text-xl font-bold text-breu">Como conectar</h2>
          <ol className="mt-5 space-y-4">
            {INSTRUCTIONS.map((t, i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="font-data flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-iris/10 text-xs font-medium text-iris">
                  {i + 1}
                </span>
                <span className="text-sm text-aco">{t}</span>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-bruma/60 px-4 py-3.5">
            <ShieldCheck className="h-5 w-5 shrink-0 text-iris" />
            <p className="text-xs text-aco">
              Conexão segura e dentro da LGPD. Seus contatos são seus — desconectou, leva tudo.
            </p>
          </div>
        </div>

        {/* QR */}
        <div className="flex flex-col items-center justify-center gap-5 bg-breu p-7 text-white sm:p-9">
          <div className="rounded-2xl bg-white p-4">
            <FauxQR />
          </div>
          <div className="flex items-center gap-2 text-sm text-bruma/70">
            <span className="hf-breathe h-2 w-2 rounded-full bg-iris-claro" />
            Aguardando leitura…
          </div>
          <p className="font-data text-center text-[11px] uppercase tracking-wider text-bruma/40">
            o código expira em 60s · gera outro automático
          </p>
        </div>
      </div>

      {/* Rodapé */}
      <div className="mt-6 flex items-center justify-between">
        <Link href="/painel" className="text-sm text-aco/60 transition hover:text-breu">
          Pular por agora
        </Link>
        <Link
          href="/painel/conectar"
          className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
        >
          <Smartphone className="h-4 w-4" /> Conectar no WhatsApp
        </Link>
      </div>
    </div>
  );
}

/** QR-Code estilizado (placeholder determinístico) — apenas visual. */
function FauxQR() {
  const N = 21;
  const m = 9;
  const size = N * m;
  const isFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (isFinder(x, y)) continue;
      if ((x * 3 + y * 7 + x * y) % 3 === 0) cells.push({ x, y });
    }
  }

  const Finder = ({ ox, oy }: { ox: number; oy: number }) => (
    <g>
      <rect x={ox * m} y={oy * m} width={7 * m} height={7 * m} rx={3 * m} fill="#0B0D1A" />
      <rect
        x={(ox + 1) * m}
        y={(oy + 1) * m}
        width={5 * m}
        height={5 * m}
        rx={2.2 * m}
        fill="#fff"
      />
      <rect
        x={(ox + 2) * m}
        y={(oy + 2) * m}
        width={3 * m}
        height={3 * m}
        rx={m}
        fill="#6A4BF0"
      />
    </g>
  );

  return (
    <svg width={150} height={150} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x * m + 1}
          y={c.y * m + 1}
          width={m - 2}
          height={m - 2}
          rx={2}
          fill="#0B0D1A"
        />
      ))}
      <Finder ox={0} oy={0} />
      <Finder ox={N - 7} oy={0} />
      <Finder ox={0} oy={N - 7} />
    </svg>
  );
}
