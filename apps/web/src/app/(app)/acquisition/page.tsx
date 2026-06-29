"use client";

import { useEffect, useState } from "react";
import {
  Target,
  Link2,
  MousePointerClick,
  UserPlus,
  Copy,
  ListChecks,
  Trash2,
  Check,
  Megaphone,
  Users2,
  Image as ImageIcon,
  TrendingUp,
} from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { type AdCampaign, type AdStatus, type Group } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";

const statusTone: Record<AdStatus, "green" | "amber" | "slate"> = {
  ativa: "green",
  pausada: "amber",
  rascunho: "slate",
};

// Público padrão p/ atrair revendedoras de moda (recipe concreto p/ o Meta).
const DEFAULT_AUDIENCE =
  "Localização: Brasil (ou um raio de 30–50km da sua cidade) · Idade: 23–50 · Gênero: Mulheres · " +
  "Interesses: revenda de roupas, sacoleira, brechó, moda feminina, empreendedorismo feminino, renda extra, Shein/Shopee · " +
  "Posicionamentos: Reels e Stories do Instagram (melhor custo).";

// Modelos prontos do método (curados — sem IA). Preenchem o kit com 1 clique.
const AD_TEMPLATES = [
  {
    label: "Atacado p/ revendedoras",
    primaryText:
      "🧥 Quer comprar roupa de atacado direto da fábrica e revender com lucro? Entra no nosso grupo VIP e receba os lançamentos antes de todo mundo 👇",
    headline: "Atacado de moda a partir de R$19,90",
    description: "Entre no grupo e receba o catálogo",
    script: "Entrada no grupo → boas-vindas automática + catálogo → primeira oferta em 24h.",
    audience: DEFAULT_AUDIENCE,
    imagePrompt:
      "Foto realista de uma arara cheia de roupas femininas coloridas, etiqueta 'R$19,90' em destaque, luz de loja, vertical 9:16, espaço para texto no topo, estilo catálogo de atacado.",
    creatives: [
      "Vídeo 9:16 com a arara cheia de peças + preço na tela",
      "Carrossel com 5 looks montados e o preço de atacado",
      "Foto da sacoleira mostrando o lucro da semana (prova social)",
    ],
  },
  {
    label: "Grupo VIP fechado (FOMO)",
    primaryText:
      "👜 Grupo fechado só para revendedoras. Preço de atacado, novidade toda semana e vagas limitadas. Bora garantir a sua?",
    headline: "Grupo VIP de revendedoras",
    description: "Vagas limitadas no grupo",
    script: "Entrada → mensagem de regra do grupo → oferta de primeira compra.",
    audience: DEFAULT_AUDIENCE,
    imagePrompt:
      "Print estilizado de um grupo de WhatsApp movimentado com selo 'VIP' dourado, fundo escuro premium, vertical 9:16, gatilho de exclusividade.",
    creatives: [
      "Print do grupo movimentado (gatilho de FOMO)",
      "Depoimento em vídeo de uma revendedora atual",
    ],
  },
  {
    label: "Preço de fábrica",
    primaryText:
      "🏭 Direto da fábrica pro seu negócio. Sem atravessador, sem pedido mínimo alto. Entra no grupo e veja os preços 👇",
    headline: "Preço de fábrica, sem atravessador",
    description: "Catálogo no grupo de WhatsApp",
    script: "Entrada → catálogo + tabela de preço → condição de primeira compra.",
    audience: DEFAULT_AUDIENCE,
    imagePrompt:
      "Foto de fardos e prateleiras de estoque de roupas numa fábrica, iluminação industrial, selo 'preço de fábrica', vertical 9:16.",
    creatives: ["Vídeo dos fardos / estoque da fábrica", "Comparativo de preço atacado x varejo"],
  },
];

export default function AcquisitionPage() {
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [budget, setBudget] = useState(30);
  const [primaryText, setPrimaryText] = useState(AD_TEMPLATES[0].primaryText);
  const [headline, setHeadline] = useState(AD_TEMPLATES[0].headline);
  const [description, setDescription] = useState(AD_TEMPLATES[0].description);
  const [audience, setAudience] = useState(DEFAULT_AUDIENCE);
  const [imagePrompt, setImagePrompt] = useState(AD_TEMPLATES[0].imagePrompt);
  const [script, setScript] = useState(AD_TEMPLATES[0].script);
  const [creatives, setCreatives] = useState<string[]>(AD_TEMPLATES[0].creatives);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false); // 1º fetch das campanhas (skeleton até lá)

  useEffect(() => {
    setOrigin(window.location.origin);
    loadCampaigns();
    fetch("/api/groups")
      .then((r) => r.json())
      .then((g: Group[]) => {
        setGroups(g);
        if (g.length > 0) setGroupId(g[0].id);
      })
      .catch(() => {});
  }, []);

  async function loadCampaigns() {
    try {
      setAdCampaigns(await fetch("/api/ad-campaigns").then((r) => r.json()));
    } catch {
    } finally {
      setLoaded(true);
    }
  }

  const targetGroup = groups.find((g) => g.id === groupId);

  // Estimativa grosseira (BR, tráfego/cliques-WhatsApp): ~R$0,60/clique, ~35% entram.
  const cliquesDia = Math.round(budget / 0.6);
  const entradasDia = Math.round(cliquesDia * 0.35);

  function applyTemplate(t: (typeof AD_TEMPLATES)[number]) {
    setPrimaryText(t.primaryText);
    setHeadline(t.headline);
    setDescription(t.description);
    setScript(t.script);
    setAudience(t.audience);
    setImagePrompt(t.imagePrompt);
    setCreatives(t.creatives);
  }

  async function save() {
    if (!targetGroup) return;
    if (!/^https?:\/\//i.test(inviteUrl.trim())) {
      toast("Cole o link de convite do grupo (chat.whatsapp.com/...)", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Lotar ${targetGroup.name}`,
          targetGroupId: targetGroup.id,
          targetGroupName: targetGroup.name,
          inviteUrl: inviteUrl.trim(),
          pixelId: pixelId.trim(),
          budgetDaily: budget,
          primaryText,
          headline,
          description,
          audience,
          script,
          creativeIdeas: creatives,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao salvar");
      }
      setInviteUrl("");
      await loadCampaigns();
      toast("Kit pronto! Link de destino gerado 🎯");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta campanha?")) return;
    await fetch(`/api/ad-campaigns?id=${id}`, { method: "DELETE" });
    await loadCampaigns();
    toast("Campanha excluída");
  }

  return (
    <>
      <Topbar title="Atrair revendedoras" subtitle="Anúncio no Meta que traz gente NOVA pro grupo" />
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-5">
        {/* Lista de campanhas */}
        <div className="space-y-3 xl:col-span-3">
          <h2 className="font-semibold text-breu">Suas campanhas de anúncio</h2>
          {!loaded &&
            Array.from({ length: 2 }).map((_, i) => (
              <Card key={`sk-${i}`} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </Card>
            ))}
          {loaded && adCampaigns.length === 0 && (
            <Card className="p-8 text-center text-sm text-aco/50">
              Nenhuma campanha ainda. Monte o kit ao lado — em 2 min você tem tudo pra subir no Meta.
            </Card>
          )}

          {adCampaigns.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10 text-iris">
                    <Target className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-breu">{c.name}</p>
                    <p className="text-xs text-aco/50">
                      Destino: {c.targetGroupName} · R${c.budgetDaily}/dia
                    </p>
                  </div>
                </div>
                <Badge tone={statusTone[c.status]}>{c.status}</Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-bruma pt-3 text-center">
                <Metric icon={MousePointerClick} label="Cliques no link" value={c.clicks} />
                <Metric icon={UserPlus} label="Entradas no grupo" value={c.entries} highlight />
                <Metric icon={Target} label="Custo/lead" value={c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : "—"} />
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg bg-bruma px-3 py-2">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-aco/50" />
                <span className="flex-1 truncate font-mono text-xs text-aco/70">
                  {origin}/r/{c.linkSlug}
                </span>
                <CopyBtn text={`${origin}/r/${c.linkSlug}`} onCopy={() => toast("Link copiado")} />
                <button onClick={() => remove(c.id)} className="text-aco/30 hover:text-red-500" title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>

        {/* Criador do kit */}
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-iris" />
                Montar kit de anúncio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Grupo a lotar">
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-aco/30 bg-white px-3 text-sm text-breu outline-none focus:border-iris-claro focus:ring-2 focus:ring-iris/15"
                  >
                    {groups.length === 0 && <option>Conecte a engine</option>}
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Orçamento/dia (R$)">
                  <Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
                </Field>
              </div>

              {/* Link de convite do grupo — o destino REAL do anúncio */}
              <Field label="Link de convite do grupo (destino do anúncio)">
                <Input
                  placeholder="https://chat.whatsapp.com/..."
                  value={inviteUrl}
                  onChange={(e) => setInviteUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-aco/50">
                  No WhatsApp: abra o grupo → Convidar via link → Copiar. Eu gero um link rastreável a partir dele.
                </p>
              </Field>

              <Field label="Pixel do Facebook (opcional)">
                <Input
                  placeholder="Ex: 123456789012345"
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  inputMode="numeric"
                />
                <p className="mt-1 text-xs text-aco/50">
                  Com o Pixel, o Meta otimiza o anúncio por quem REALMENTE entra no grupo (dispara o evento &quot;Lead&quot;).
                </p>
              </Field>

              <div>
                <p className="mb-1.5 text-sm font-medium text-aco">Usar modelo do método</p>
                <div className="flex flex-wrap gap-1.5">
                  {AD_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => applyTemplate(t)}
                      className="rounded-md border border-breu/10 bg-white px-2 py-1 text-xs font-medium text-aco hover:border-iris/30 hover:text-iris-escuro"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <CopyField label="Texto principal do anúncio" value={primaryText} onChange={setPrimaryText} rows={3} toast={toast} />
              <div className="grid grid-cols-1 gap-3">
                <CopyField label="Título" value={headline} onChange={setHeadline} toast={toast} />
                <CopyField label="Descrição" value={description} onChange={setDescription} toast={toast} />
              </div>

              <CopyField
                label="Público-alvo (cole na segmentação do Meta)"
                value={audience}
                onChange={setAudience}
                rows={3}
                icon={<Users2 className="h-3.5 w-3.5" />}
                toast={toast}
              />
              <CopyField
                label="Prompt p/ gerar a imagem do criativo"
                value={imagePrompt}
                onChange={setImagePrompt}
                rows={3}
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                toast={toast}
              />

              {/* Estimativa */}
              <div className="flex items-start gap-2 rounded-xl border border-iris/20 bg-iris/10 p-3">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-iris" />
                <p className="text-xs text-iris-escuro">
                  Com <strong>R${budget}/dia</strong>, estimativa grosseira: ~<strong>{cliquesDia} cliques</strong> e ~
                  <strong>{entradasDia} entradas</strong> por dia no grupo. O número real aparece nas métricas acima.
                </p>
              </div>

              <Button className="w-full" onClick={save} disabled={saving || !targetGroup}>
                {saving ? "Gerando..." : "Gerar link e salvar kit"}
              </Button>
            </CardContent>
          </Card>

          {/* Passo-a-passo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListChecks className="h-4 w-4 text-aco/50" />
                Como subir no Gerenciador de Anúncios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-aco">
                {[
                  "Objetivo: Tráfego (ou Engajamento).",
                  "Destino → Site: cole o link rastreável gerado no card da campanha.",
                  "Público: cole o campo 'Público-alvo' acima.",
                  "Criativo: gere a imagem com o prompt acima (ou grave o vídeo sugerido).",
                  "Texto/Título/Descrição: copie os campos ao lado.",
                  "Publique. Cliques e entradas aparecem aqui automaticamente.",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris text-[11px] font-medium text-white">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-aco">{label}</label>
      {children}
    </div>
  );
}

function CopyField({
  label,
  value,
  onChange,
  rows,
  icon,
  toast,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  icon?: React.ReactNode;
  toast: (m: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm font-medium text-aco">
          {icon}
          {label}
        </label>
        <CopyBtn text={value} onCopy={() => toast("Copiado")} label="copiar" />
      </div>
      {rows ? (
        <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function CopyBtn({ text, onCopy, label }: { text: string; onCopy: () => void; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        onCopy();
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-iris hover:bg-iris/10"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div>
      <Icon className={`mx-auto h-4 w-4 ${highlight ? "text-iris" : "text-aco/50"}`} />
      <p className={`mt-1 text-sm font-semibold ${highlight ? "text-iris" : "text-breu"}`}>{value}</p>
      <p className="text-[11px] text-aco/50">{label}</p>
    </div>
  );
}
