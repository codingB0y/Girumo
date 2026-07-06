import { cn } from "@/lib/utils";

// Poço do balcão: fundo inset, foco com anel de íris que "abre" da borda.
const base =
  "w-full rounded-[10px] border border-breu/10 bg-poco text-sm text-breu placeholder:text-aco/40 outline-none " +
  "transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] " +
  "focus:border-iris/50 focus:bg-papel focus:shadow-[0_0_0_3px_rgba(106,75,240,0.15)] " +
  "disabled:opacity-45 disabled:cursor-not-allowed";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-11 px-3.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "px-3.5 py-2.5", className)} {...props} />;
}
