import Image from "next/image";
import { Check } from "lucide-react";
import { SpotlightCard } from "@/components/landing/interactive";

export function BentoCard({
  icon: Icon,
  title,
  line,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <SpotlightCard className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:-translate-y-1 hover:border-iris/40 hover:bg-white/[0.05] hover:shadow-[0_20px_50px_-20px_rgba(106,75,240,0.45)] sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-bruma/60">{line}</p>
      <div className="mt-5 flex-1">{children}</div>
    </SpotlightCard>
  );
}

/** Screenshot limpo (sem chrome) dentro de um card bento. */
export function BentoShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-breu-2">
      <Image src={src} alt={alt} fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 640px" />
    </div>
  );
}

export function MiniCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SpotlightCard className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:-translate-y-1 hover:border-iris/40 hover:bg-white/[0.05] hover:shadow-[0_20px_50px_-20px_rgba(106,75,240,0.45)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="font-display text-base font-bold text-white">{title}</h3>
        <p className="mt-1 text-sm text-bruma/60">{children}</p>
      </div>
    </SpotlightCard>
  );
}
