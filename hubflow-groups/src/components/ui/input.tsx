import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10 px-3.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "px-3.5 py-2.5", className)} {...props} />;
}
