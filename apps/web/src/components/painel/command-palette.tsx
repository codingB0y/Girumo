"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sun,
  Layers,
  Users,
  UserPlus,
  TrendingUp,
  Image as ImageIcon,
  Settings,
  Palette,
  Plus,
  Smartphone,
  Sparkles,
  CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  section: "Ir para" | "Ações" | "Grupos";
  icon: typeof Search;
  href: string;
  hint?: string;
};

const ITEMS: Item[] = [
  { label: "Hoje", section: "Ir para", icon: Sun, href: "/painel" },
  { label: "Campanhas", section: "Ir para", icon: Layers, href: "/painel/campanhas" },
  { label: "Grupos", section: "Ir para", icon: Users, href: "/painel/grupos" },
  { label: "Contatos", section: "Ir para", icon: UserPlus, href: "/painel/contatos" },
  { label: "Resultados", section: "Ir para", icon: TrendingUp, href: "/painel/resultados" },
  { label: "Biblioteca", section: "Ir para", icon: ImageIcon, href: "/painel/biblioteca" },
  { label: "Configurações", section: "Ir para", icon: Settings, href: "/painel/configuracoes" },
  { label: "Design System", section: "Ir para", icon: Palette, href: "/painel/ds" },
  { label: "Nova campanha", section: "Ações", icon: Plus, href: "/painel/campanhas/nova", hint: "criar disparo" },
  { label: "Conectar WhatsApp", section: "Ações", icon: Smartphone, href: "/painel/conectar" },
  { label: "Lotar grupos", section: "Ações", icon: Sparkles, href: "/painel/grupos" },
  { label: "Atacado Premium SP", section: "Grupos", icon: Users, href: "/painel/grupos" },
  { label: "Revenda Moda Brás", section: "Grupos", icon: Users, href: "/painel/grupos" },
  { label: "Clientes VIP Sul", section: "Grupos", icon: Users, href: "/painel/grupos" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  // grupos por seção, preservando a ordem do array filtrado (índice = posição global)
  const grouped = useMemo(() => {
    const map = new Map<string, { item: Item; index: number }[]>();
    results.forEach((item, index) => {
      const arr = map.get(item.section) ?? [];
      arr.push({ item, index });
      map.set(item.section, arr);
    });
    return [...map.entries()];
  }, [results]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hf:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hf:command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  const select = (i: number) => {
    const item = results[i];
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(active);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        aria-label="Fechar"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-volt-950/50 backdrop-blur-sm"
      />
      <div className="pn-palette-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-volt-950/10 bg-papel shadow-[var(--shadow-pn-3)]">
        <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-4">
          <Search className="h-4 w-4 text-aco/50" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscar grupo, campanha ou ação…"
            className="flex-1 bg-transparent py-4 text-sm text-volt-950 outline-none placeholder:text-aco/40"
          />
          <kbd className="font-data rounded border border-volt-950/15 bg-canvas-100 px-1.5 py-0.5 text-[10px] text-aco/55">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-aco/50">Nada encontrado.</p>
          )}
          {grouped.map(([section, entries]) => (
            <div key={section} className="mb-1">
              <p className="font-data px-3 py-1.5 text-[10px] uppercase tracking-wider text-aco/40">
                {section}
              </p>
              {entries.map(({ item, index }) => {
                const Icon = item.icon;
                const isActive = index === active;
                return (
                  <button
                    key={item.label}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => select(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                      isActive ? "bg-cobalt-500/[0.08] text-volt-950" : "text-aco hover:bg-canvas-100/60",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive ? "text-cobalt-500" : "text-aco/50")} />
                    <span className="flex-1">{item.label}</span>
                    {item.hint && (
                      <span className="font-data text-[10px] uppercase tracking-wider text-aco/40">
                        {item.hint}
                      </span>
                    )}
                    {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-cobalt-500" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Botão da topbar que abre o palette (dispara o evento global). */
export function CommandTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("hf:command"))}
      className="ml-auto flex items-center gap-2 rounded-[10px] border border-volt-950/10 bg-papel px-3 py-2 text-sm text-aco/60 shadow-[var(--shadow-pn-1)] transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500/30 hover:shadow-[var(--shadow-pn-2)]"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">Buscar grupo, campanha…</span>
      <kbd className="font-data ml-1 hidden rounded border border-volt-950/15 bg-canvas-100 px-1.5 text-[10px] text-aco/60 sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}
