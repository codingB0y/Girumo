"use client";

import { useEffect, useState } from "react";
import { FileText, Copy, Trash2, Sparkles } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type MessageTemplate } from "@/lib/mock-data";
import { useToast } from "@/components/toast";

const categoryLabel: Record<MessageTemplate["category"], string> = {
  drop: "Drop",
  promocao: "Promoção",
  reativacao: "Reativação",
  "pos-venda": "Pós-venda",
};

const categoryTone = {
  drop: "green",
  promocao: "amber",
  reativacao: "blue",
  "pos-venda": "slate",
} as const;

const VARIABLES = ["{nome}", "{nome_loja}", "{link_catalogo}", "{preco}", "{desconto}"];

// Biblioteca pronta (B4) — modelos curados p/ atacado de moda. SEM IA: copy fixa,
// só pra a biblioteca não nascer vazia. O lojista edita/duplica depois.
const STARTER_TEMPLATES: Pick<MessageTemplate, "name" | "category" | "body">[] = [
  {
    name: "Boas-vindas ao grupo",
    category: "drop",
    body: "Seja bem-vinda à {nome_loja}! 💛\nAqui você recebe os drops e promoções em primeira mão.\nCatálogo 👉 {link_catalogo}",
  },
  {
    name: "Drop de novidades",
    category: "drop",
    body: "🔥 CHEGOU COISA NOVA NA {nome_loja}!\nPeças a partir de {preco}.\nGaranta a sua 👉 {link_catalogo}",
  },
  {
    name: "Promoção relâmpago",
    category: "promocao",
    body: "⚡ SÓ HOJE: {desconto} OFF na {nome_loja}!\nAproveita antes de acabar 👉 {link_catalogo}",
  },
  {
    name: "Reativação (grupo parado)",
    category: "reativacao",
    body: "Oi {nome}! Faz tempo que não te vejo por aqui 👀\nSeparei novidades na {nome_loja} que são a sua cara.\nDá uma olhada 👉 {link_catalogo}",
  },
  {
    name: "Pós-venda / fidelização",
    category: "pos-venda",
    body: "Oi {nome}, obrigada pela compra na {nome_loja}! 🥰\nQualquer coisa é só chamar aqui. E fica de olho nos próximos drops do grupo!",
  },
];

export default function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loaded, setLoaded] = useState(false); // 1º fetch (skeleton até lá)
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MessageTemplate["category"]>("drop");
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState(
    "🔥 NOVIDADE NA {nome_loja}!\nPeças novas a partir de {preco}.\nCatálogo 👉 {link_catalogo}",
  );

  async function load() {
    try {
      setTemplates(await fetch("/api/templates").then((r) => r.json()));
    } catch {
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, body }),
      });
      setName("");
      await load();
      toast("Template salvo");
    } catch {
      toast("Erro ao salvar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este template?")) return;
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    await load();
    toast("Template excluído");
  }

  function insertVar(v: string) {
    setBody((prev) => (prev ? `${prev} ${v}` : v));
  }

  async function seedStarters() {
    setSaving(true);
    try {
      for (const t of STARTER_TEMPLATES) {
        await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
      }
      await load();
      toast(`${STARTER_TEMPLATES.length} modelos prontos carregados`);
    } catch {
      toast("Erro ao carregar modelos", "error");
    } finally {
      setSaving(false);
    }
  }

  // Renderiza a prévia substituindo variáveis por exemplos.
  const preview = body
    .replaceAll("{nome}", "Joana")
    .replaceAll("{nome_loja}", "Maria Modas")
    .replaceAll("{link_catalogo}", "catalogo.com/maria")
    .replaceAll("{preco}", "R$29,90")
    .replaceAll("{desconto}", "30%");

  return (
    <>
      <Topbar title="Modelos de mensagem" subtitle="Mensagens prontas para reaproveitar" />
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-5">
        {/* Lista */}
        <div className="space-y-3 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-breu">Sua biblioteca</h2>
            {templates.length > 0 && (
              <Button size="sm" variant="ghost" onClick={seedStarters} disabled={saving}>
                <Sparkles className="h-3.5 w-3.5" />
                Carregar modelos prontos
              </Button>
            )}
          </div>
          {!loaded &&
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={`sk-${i}`} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-full max-w-xs" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </Card>
            ))}
          {loaded && templates.length === 0 && (
            <Card className="flex flex-col items-center gap-3 p-8 text-center">
              <Sparkles className="h-8 w-8 text-green-400" />
              <p className="text-sm text-aco/70">
                Sua biblioteca está vazia. Comece com modelos prontos para atacado de moda
                <br />ou crie o seu ao lado.
              </p>
              <Button size="sm" onClick={seedStarters} disabled={saving}>
                <Sparkles className="h-3.5 w-3.5" />
                {saving ? "Carregando..." : "Carregar 5 modelos prontos"}
              </Button>
            </Card>
          )}
          {templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bruma text-aco/70">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-breu">{t.name}</p>
                      <Badge tone={categoryTone[t.category]}>{categoryLabel[t.category]}</Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-aco/70">{t.body}</p>
                    <p className="mt-2 text-xs text-aco/50">Usado {t.uses}x</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t border-bruma pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(t.body);
                    toast("Copiado");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => remove(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Editor */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Novo template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-aco">Nome</label>
                  <Input
                    placeholder="Ex: Drop de sexta"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-aco">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MessageTemplate["category"])}
                    className="h-10 w-full rounded-lg border border-aco/30 bg-white px-3 text-sm text-breu outline-none focus:border-iris-claro focus:ring-2 focus:ring-iris/15"
                  >
                    <option value="drop">Drop</option>
                    <option value="promocao">Promoção</option>
                    <option value="reativacao">Reativação</option>
                    <option value="pos-venda">Pós-venda</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-aco">Mensagem</label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-aco">Inserir variável</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map((v) => (
                    <button
                      key={v}
                      onClick={() => insertVar(v)}
                      className="rounded-md bg-iris/10 px-2 py-1 text-xs font-medium text-iris-escuro hover:bg-iris/10"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-aco/50">
                  Variáveis são preenchidas automaticamente no envio.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-aco">
                  Prévia (com exemplos)
                </label>
                <div className="rounded-lg bg-[#e5ddd5] p-4">
                  <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
                    <p className="whitespace-pre-wrap text-sm text-breu">{preview}</p>
                    <p className="mt-1 text-right text-[10px] text-aco/50">12:30 ✓✓</p>
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={save} disabled={saving || !name.trim()}>
                {saving ? "Salvando..." : "Salvar template"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
