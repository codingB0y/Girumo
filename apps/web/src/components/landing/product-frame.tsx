import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Moldura de "janela de app" para telas reais do painel HubFlow.
 * - Com `src`: mostra o screenshot real (public/product/*.png).
 * - Sem `src`: mostra um placeholder na marca ("tela real em breve") —
 *   troca-se por <Image> assim que os prints novos do /painel chegarem,
 *   passando apenas o `src`.
 */
export function ProductFrame({
  src,
  alt,
  chrome = "app.hubflow.com.br",
  aspect = "16 / 10",
  className,
}: {
  src?: string;
  alt: string;
  chrome?: string;
  aspect?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hf-shot overflow-hidden rounded-2xl border border-white/10 bg-breu-2",
        className,
      )}
    >
      {/* chrome da janela */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-breu px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="font-data ml-3 truncate text-[11px] tracking-wider text-bruma/40">
          {chrome}
        </span>
      </div>

      <div className="relative w-full" style={{ aspectRatio: aspect }}>
        {src ? (
          <Image src={src} alt={alt} fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 560px" />
        ) : (
          <Placeholder label={alt} />
        )}
      </div>
    </div>
  );
}

/** Esqueleto na marca enquanto a tela real não chega. */
function Placeholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col gap-3 p-5">
      <div className="hf-breathe pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-iris/15 blur-3xl" />
      {/* barrinhas simulando UI */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-iris/25" />
        <div className="h-2.5 w-28 rounded-full bg-white/10" />
        <div className="ml-auto h-7 w-20 rounded-lg bg-iris/30" />
      </div>
      <div className="grid flex-1 grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="h-2 w-10 rounded-full bg-white/10" />
            <div className="mt-3 h-2 w-14 rounded-full bg-iris/20" />
            <div className="mt-2 h-2 w-8 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
      <p className="font-data relative text-center text-[11px] uppercase tracking-wider text-bruma/35">
        {label} · tela real em breve
      </p>
    </div>
  );
}
