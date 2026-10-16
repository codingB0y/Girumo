import Image from "next/image";
import { Camera, ChartColumn, LayoutTemplate, Link2, QrCode, ShieldCheck, Target, type LucideIcon } from "lucide-react";
import { IMG, MODELOS } from "@/components/home-shared/home-data";
import { BotaoTeste, H2, MIOLO, TINTA, TOPO_CENTRO } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

const RECURSOS_PAGINA: ReadonlyArray<{ icone: LucideIcon; texto: string }> = [
  { icone: LayoutTemplate, texto: "Modelos prontos" },
  { icone: Camera, texto: "Logo, cor e foto seus" },
  { icone: ShieldCheck, texto: "Aceite da LGPD" },
  { icone: Target, texto: "Pixel da Meta" },
];

/** Os três modelos lado a lado, o do meio maior, sobre a faixa que diz em que plano a página vem. */
function GaleriaModelos() {
  return (
    <div className="relative mt-4 flex h-80 items-center justify-center gap-2.5 overflow-hidden rounded-3xl bg-[#F4FAEA] pb-16 lg:h-[440px] lg:gap-[22px] lg:pb-[50px]">
      {MODELOS.map((modelo, i) => {
        const maior = i === 1;
        return (
          <figure
            key={modelo.src}
            className={cn(
              "shrink-0 rounded-[14px] bg-white px-2.5 pb-3 pt-2.5 shadow-[0_20px_40px_-24px_rgba(7,25,35,.4)]",
              maior ? "w-[200px] lg:w-[360px]" : "w-[140px] opacity-90 lg:w-[280px]",
            )}
          >
            <Image
              src={modelo.src}
              alt={`Modelo de página ${modelo.nome}`}
              width={780}
              height={1280}
              sizes={maior ? "(min-width: 1024px) 340px, 180px" : "(min-width: 1024px) 260px, 120px"}
              className={cn("block w-full rounded-lg object-cover object-top", maior ? "h-[210px] lg:h-[300px]" : "h-[170px] lg:h-[230px]")}
            />
            <figcaption className="mt-[9px] text-[12.5px] font-semibold lg:text-sm">{modelo.nome}</figcaption>
          </figure>
        );
      })}
      <p className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center bg-volt-950 px-[18px] text-center text-[13px] text-white lg:h-[50px] lg:text-[14.5px]">
        A página é do Growth pra cima e pode ficar no seu domínio: links.sualoja.com.br
      </p>
    </div>
  );
}

/** "Sua página de captação": o que dá pra pôr na página e a galeria dos modelos (ref. Tray). */
export function VitrinePaginas() {
  return (
    <section aria-labelledby="paginas-titulo" className="py-[60px] lg:py-24">
      <div className={cn(MIOLO, TOPO_CENTRO)}>
        <h2 id="paginas-titulo" className={H2}>
          Sua página de captação com a cara da sua loja
        </h2>
        <BotaoTeste className="lg:justify-self-end" />
      </div>
      <div className={MIOLO}>
        <ul className="mt-[22px] grid grid-cols-2 gap-2 lg:mt-9 lg:grid-cols-4 lg:gap-3">
          {RECURSOS_PAGINA.map(({ icone: Icone, texto }) => (
            <li
              key={texto}
              className="flex h-11 items-center justify-center gap-[9px] rounded-xl border border-[#E3EADF] bg-white text-[13px] font-semibold text-[#2F434C] lg:h-12 lg:text-[14.5px]"
            >
              <Icone aria-hidden className="size-[18px] shrink-0 text-cobalt-500" />
              {texto}
            </li>
          ))}
        </ul>
        <GaleriaModelos />
      </div>
    </section>
  );
}

const BALCAO: ReadonlyArray<{ icone: LucideIcon; texto: string }> = [
  { icone: QrCode, texto: "QR code da campanha pro balcão" },
  { icone: Link2, texto: "O mesmo link na bio, no anúncio e no story" },
  { icone: ChartColumn, texto: "Venda anotada com a origem (Growth)" },
];

/** Foto do balcão + cartão: a loja física também enche o grupo. */
export function VitrineBalcao() {
  return (
    <section aria-labelledby="balcao-titulo" className={cn(TINTA, "py-[60px] lg:py-24")}>
      <div className={cn(MIOLO, "grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]")}>
        <figure className="relative h-[400px] overflow-hidden rounded-3xl lg:h-[520px]">
          <Image
            src={IMG.fotoBalcao.src}
            alt="Atendente sorrindo no balcão da loja"
            fill
            sizes="(min-width: 1024px) 420px, 100vw"
            className="object-cover object-[center_20%]"
          />
        </figure>
        <div className="flex flex-col justify-center rounded-3xl border border-[#E3EADF] bg-white px-[22px] py-7 lg:p-14">
          <h2 id="balcao-titulo" className={H2}>
            Loja física ou só online, o grupo vende
          </h2>
          <p className="mt-4 max-w-[34em] text-[16.5px] leading-relaxed text-[#33474F]">
            Ponha o QR code do link no balcão e o link na bio e no anúncio. Quem chega cai no grupo com vaga, e a venda
            volta com a origem.
          </p>
          <ul className="mb-7 mt-[22px] grid gap-3">
            {BALCAO.map(({ icone: Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-[15.5px] font-semibold">
                <Icone aria-hidden className="size-5 shrink-0 text-cobalt-500" />
                {texto}
              </li>
            ))}
          </ul>
          <BotaoTeste className="lg:self-start" />
        </div>
      </div>
    </section>
  );
}
