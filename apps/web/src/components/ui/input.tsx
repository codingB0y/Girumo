import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-breu/10 bg-white text-sm text-breu placeholder:text-aco/40 outline-none transition-colors focus:border-iris/40 focus:ring-4 focus:ring-iris/10";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10 px-3.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "px-3.5 py-2.5", className)} {...props} />;
}
