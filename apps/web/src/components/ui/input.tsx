import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 text-sm text-volt-950 placeholder:text-slate-600/60 outline-none " +
  "transition-[border-color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-girumo)] " +
  "focus-visible:border-cobalt-500 focus-visible:ring-3 focus-visible:ring-cobalt-500/15 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 " +
  "disabled:opacity-45 disabled:cursor-not-allowed";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-[var(--control-height)] px-3.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(base, "min-h-[calc(var(--control-height-prominent)*2)] px-3.5 py-2.5", className)}
      {...props}
    />
  );
}
