"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  MessageSquare,
  QrCode,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = "welcome" | "connect" | "template" | "done";

const TEMPLATES = [
  {
    id: "oferta-diaria",
    label: "Oferta do dia",
    emoji: "🔥",
    text: "🔥 OFERTA DO DIA\n\nProduto: [nome do produto]\nDe R$ [preço antigo] por R$ [preço]\n\n⚡ Só hoje! Chama no privado pra garantir.",
  },
  {
    id: "novidade",
    label: "Novidade",
    emoji: "✨",
    text: "✨ NOVIDADE NA LOJA\n\nChegou [produto]!\n\n📸 Fotos no grupo em instantes.\nQuem quiser, chama no privado.",
  },
  {
    id: "reativacao",
    label: "Reativação",
    emoji: "👋",
    text: "👋 Oi, sumidx!\n\nFaz tempo que você não aparece aqui. Separei umas ofertas especiais pra quem volta hoje:\n\n🎁 [produto] com [desconto]%\n\nChama no privado!",
  },
  {
    id: "lancamento",
    label: "Lançamento",
    emoji: "🚀",
    text: "🚀 LANÇAMENTO\n\n[Produto novo] acaba de chegar!\n\n✅ [Benefício 1]\n✅ [Benefício 2]\n✅ [Benefício 3]\n\nPrimeiros pedidos ganham frete grátis. Corre!",
  },
];

export function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0].id);
  const [copied, setCopied] = useState(false);

  const firstName = userName.split(" ")[0] || "";

  function handleCopy() {
    const tpl = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (tpl) {
      navigator.clipboard.writeText(tpl.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleFinish() {
    router.replace("/dashboard");
  }

  return (
    <div className="w-full max-w-lg rounded-3xl border border-breu/[0.06] bg-white p-8 shadow-xl">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {(["welcome", "connect", "template", "done"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              i <= ["welcome", "connect", "template", "done"].indexOf(step)
                ? "bg-iris"
                : "bg-bruma",
            )}
          />
        ))}
      </div>

      {/* Step: Welcome */}
      {step === "welcome" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-iris/10">
            <Rocket className="h-8 w-8 text-iris" />
          </div>
          <h1 className="font-display text-2xl font-bold text-breu">
            {firstName ? `Bem-vind(a), ${firstName}!` : "Bem-vind(a)!"}
          </h1>
          <p className="text-sm text-aco/70">
            Vamos configurar seu HubFlow em 2 minutos. Ao final, você já vai poder disparar
            sua primeira oferta pra todos os grupos.
          </p>
          <div className="space-y-2 rounded-xl bg-bruma/50 p-4 text-left">
            {[
              "Conectar seu WhatsApp (QR Code)",
              "Escolher um modelo de mensagem",
              "Disparar pro primeiro grupo",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-aco/80">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-iris/10 text-xs font-bold text-iris">
                  {i + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
          <Button onClick={() => setStep("connect")} className="w-full gap-2">
            Começar <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step: Connect WhatsApp */}
      {step === "connect" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
            <QrCode className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="font-display text-xl font-bold text-breu">Conecte seu WhatsApp</h2>
          <p className="text-sm text-aco/70">
            No painel, clique em &ldquo;Conectar&rdquo; e escaneie o QR Code com seu WhatsApp.
            Sem trocar de número, sem instalar nada.
          </p>
          <div className="rounded-xl border border-dashed border-aco/20 bg-bruma/30 p-8">
            <QrCode className="mx-auto h-16 w-16 text-aco/30" />
            <p className="mt-3 text-xs text-aco/50">QR Code aparece no painel → Configurações</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("welcome")} className="flex-1">
              Voltar
            </Button>
            <Button onClick={() => setStep("template")} className="flex-1 gap-2">
              Próximo <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setStep("template")}
            className="text-xs text-aco/50 underline transition hover:text-iris"
          >
            Pular — conecto depois
          </button>
        </div>
      )}

      {/* Step: Choose template */}
      {step === "template" && (
        <div className="space-y-5">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
              <MessageSquare className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="font-display mt-3 text-xl font-bold text-breu">Escolha seu 1º modelo</h2>
            <p className="text-sm text-aco/70">
              Templates prontos pra você disparar agora. Edite depois no painel.
            </p>
          </div>

          {/* Template selector */}
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedTemplate(tpl.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  selectedTemplate === tpl.id
                    ? "border-iris bg-iris/5 ring-2 ring-iris/20"
                    : "border-breu/[0.06] hover:border-iris/40",
                )}
              >
                <span className="text-lg">{tpl.emoji}</span>
                <p className="mt-1 text-xs font-medium text-breu">{tpl.label}</p>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-bruma/50 p-4">
            <pre className="whitespace-pre-wrap text-sm text-aco/80">
              {TEMPLATES.find((t) => t.id === selectedTemplate)?.text}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-iris transition hover:text-iris-escuro"
            >
              {copied ? <><Check className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar texto</>}
            </button>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("connect")} className="flex-1">
              Voltar
            </Button>
            <Button onClick={() => setStep("done")} className="flex-1 gap-2">
              Finalizar <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="font-display text-xl font-bold text-breu">Tudo pronto!</h2>
          <p className="text-sm text-aco/70">
            Seu HubFlow está configurado. Agora conecte o WhatsApp no painel e
            dispare sua primeira oferta.
          </p>
          <div className="space-y-2 rounded-xl bg-emerald-50/50 p-4 text-left">
            {[
              "Template salvo na sua biblioteca",
              "Conecte o WhatsApp nas Configurações",
              "Selecione os grupos e dispare!",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-emerald-800">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                {item}
              </div>
            ))}
          </div>
          <Button onClick={handleFinish} className="w-full gap-2">
            <Users className="h-4 w-4" /> Ir pro painel
          </Button>
        </div>
      )}
    </div>
  );
}
