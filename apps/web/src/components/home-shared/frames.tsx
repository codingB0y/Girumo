import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ImagemHome } from "./home-data";

interface CelularProps {
  img: ImagemHome;
  /** Vazio quando a moldura é decorativa (o texto ao lado já diz o que a tela mostra). */
  alt: string;
  /** Largura e posição ficam com quem usa (ex.: "w-[272px]"). */
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * Celular com o print real do painel. A tela tem a proporção do print de 390×777.
 * Borda, cantos e câmera crescem com a largura (cqw = 1% da largura do aparelho),
 * então o mesmo componente serve do celular de 96 px ao de 272 px.
 */
export function Celular({ img, alt, className, sizes = "280px", priority }: CelularProps) {
  return (
    <div className={cn("@container", className)}>
      <div className="rounded-[15cqw] bg-[#0D1E28] p-[3.2cqw] shadow-[0_34px_60px_-26px_rgba(7,25,35,.55),0_0_0_1px_rgba(7,25,35,.14)]">
        <div className="relative aspect-[390/777] overflow-hidden rounded-[12cqw] bg-[#F4F6F8]">
          <Image
            src={img.src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover object-top"
          />
          <span aria-hidden className="absolute left-1/2 top-[3cqw] size-[4.5cqw] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    </div>
  );
}

interface NavegadorProps {
  img: ImagemHome;
  alt: string;
  /** Endereço mostrado na barra (decorativo). */
  endereco: string;
  className?: string;
  sizes?: string;
}

/** Janela de navegador com o print do painel no computador. */
export function Navegador({ img, alt, endereco, className, sizes = "820px" }: NavegadorProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-white shadow-[0_30px_60px_-30px_rgba(7,25,35,.45),0_0_0_1px_rgba(7,25,35,.08)]",
        className,
      )}
    >
      <div aria-hidden className="flex h-8 items-center gap-1.5 border-b border-[#E3E8EC] bg-[#F0F3F6] px-3.5">
        <i className="size-2.5 rounded-full bg-[#D3D9DE]" />
        <i className="size-2.5 rounded-full bg-[#D3D9DE]" />
        <i className="size-2.5 rounded-full bg-[#D3D9DE]" />
        <span className="ml-3 flex h-5 items-center truncate rounded-md bg-white px-3 text-[11.5px] text-[#5D6E76]">
          {endereco}
        </span>
      </div>
      <Image src={img.src} alt={alt} width={img.width} height={img.height} sizes={sizes} className="block h-auto w-full" />
    </div>
  );
}
