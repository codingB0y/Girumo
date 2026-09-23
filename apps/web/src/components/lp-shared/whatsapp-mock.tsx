import type { ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Conversa de WhatsApp desenhada em HTML: moldura de celular, bolhas e aviso do
 * sistema. É ilustração, não print — por isso a fonte do sistema (a do próprio
 * WhatsApp), e não a da landing.
 */
const WA_FONT =
  "[font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]";

interface ChatFrameProps {
  title: string;
  subtitle?: string;
  /** Conteúdo do círculo acid do cabeçalho: iniciais ("MS") ou número do grupo ("07"). */
  avatar: ReactNode;
  /** Largura e altura saem daqui: a moldura corta o que passar da altura, como a tela do celular. */
  className?: string;
  children: ReactNode;
}

export function ChatFrame({ title, subtitle, avatar, className, children }: ChatFrameProps) {
  return (
    <figure
      aria-label={`Exemplo de conversa no grupo ${title}`}
      className={cn(
        "m-0 flex flex-col overflow-hidden rounded-[34px] border-[9px] border-volt-950 bg-[#EFEAE2] text-[#111B21] shadow-[0_24px_50px_rgba(7,25,35,.22)]",
        WA_FONT,
        className,
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-[#E9EDEF] bg-white px-3.5 py-3">
        <span
          aria-hidden
          className="grid size-[38px] shrink-0 place-items-center rounded-full bg-acid-500 text-[13px] font-black text-volt-950"
        >
          {avatar}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-[#667781]">{subtitle}</p>}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2.5 py-3">{children}</div>
    </figure>
  );
}

interface BubbleProps {
  /** Mensagem de quem posta (verde, à direita). */
  me?: boolean;
  name?: string;
  /** Cor do nome de quem escreveu, como o WhatsApp faz em grupo. Escolha uma com contraste AA no branco. */
  nameColor?: string;
  time?: string;
  /** Check duplo azul de mensagem lida. */
  read?: boolean;
  className?: string;
  children: ReactNode;
}

export function Bubble({
  me = false,
  name,
  nameColor = "#1947C9",
  time,
  read = false,
  className,
  children,
}: BubbleProps) {
  return (
    <div
      // `[line-height:…]` e não `leading-*`: o cn descarta a entrelinha quando quem usa passa um `text-[…]`.
      className={cn(
        "max-w-[86%] rounded-[9px] px-[9px] pb-[5px] pt-1.5 text-[13.5px] [line-height:1.38] text-[#111B21] shadow-[0_1px_.5px_rgba(11,20,26,.13)]",
        me ? "self-end bg-[#D9FDD3]" : "self-start bg-white",
        WA_FONT,
        className,
      )}
    >
      {name && (
        <span className="mb-px block text-[12.5px] font-bold" style={{ color: nameColor }}>
          {name}
        </span>
      )}
      {children}
      {time && (
        // slate-600 e não o #667781 do WhatsApp: no verde da bolha "me" o cinza original fica abaixo de AA.
        <span className="float-right ml-2.5 mt-[7px] inline-flex items-center gap-0.5 text-[11px] leading-none text-slate-600">
          {time}
          {read && (
            <>
              <CheckCheck aria-hidden className="size-4 text-[#53BDEB]" />
              <span className="sr-only">, lida</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

export function SystemNote({ children }: { children: ReactNode }) {
  return (
    <p
      className={cn(
        "self-center rounded-lg bg-white px-2.5 py-[5px] text-center text-xs leading-[1.3] text-[#54656F] shadow-[0_1px_.5px_rgba(11,20,26,.13)]",
        WA_FONT,
      )}
    >
      {children}
    </p>
  );
}
