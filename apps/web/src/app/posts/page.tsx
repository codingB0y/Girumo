/* eslint-disable react/no-unescaped-entities */
import { SlideFrame } from "@/components/posts/slide-frame";
import { ArrowRight, Check, X } from "lucide-react";

export const metadata = {
  title: "HubFlow — Gerador de Posts",
};

export default function PostsPage() {
  return (
    <div className="space-y-16">
      {/* ========== CATEGORIA 1 — DOR / PROBLEMA ========== */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-iris-claro">Categoria 1 — Dor / Problema</h2>

        {/* Template 1.1 — Carrossel "Antes vs Depois" */}
        <p className="mb-4 text-sm text-neutral-400">Template 1.1 — Carrossel "Antes vs Depois"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Slide 1 - Capa */}
          <SlideFrame label="Slide 1 — Capa">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <span className="mb-6 text-5xl">😮‍💨</span>
              <h2 className="font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight text-white">
                Você ainda copia e cola oferta em 40 grupos toda manhã?
              </h2>
            </div>
          </SlideFrame>

          {/* Slide 2 - Problema */}
          <SlideFrame label="Slide 2 — Problema">
            <div className="flex h-full flex-col justify-center gap-5 px-10">
              {[
                "Abre grupo 1 → cola → envia",
                "Abre grupo 2 → cola → envia",
                "Abre grupo 3 → cola → envia",
              ].map((line) => (
                <div key={line} className="flex items-center gap-3">
                  <X className="h-5 w-5 shrink-0 text-red-400" />
                  <span className="text-lg text-bruma/80">{line}</span>
                </div>
              ))}
              <div className="mt-2 flex items-start gap-3">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <span className="text-lg text-bruma/60">
                  40 minutos depois: cansou e nem mandou pra todos
                </span>
              </div>
            </div>
          </SlideFrame>

          {/* Slide 3 - Solução */}
          <SlideFrame label="Slide 3 — Solução">
            <div className="flex h-full flex-col justify-center gap-5 px-10">
              <p className="font-display mb-2 text-xl font-bold text-iris-claro">Com o HubFlow:</p>
              {[
                "1 clique = todos os grupos recebem",
                "Texto, vídeo e áudio",
                "Agenda da semana inteira de uma vez",
              ].map((line) => (
                <div key={line} className="flex items-center gap-3">
                  <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                  <span className="text-lg text-white">{line}</span>
                </div>
              ))}
            </div>
          </SlideFrame>

          {/* Slide 4 - CTA */}
          <SlideFrame label="Slide 4 — CTA">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-iris/20">
                <ArrowRight className="h-7 w-7 text-iris-claro" />
              </div>
              <h2 className="font-display text-3xl font-extrabold text-white">Teste 7 dias grátis.</h2>
              <p className="mt-3 text-lg text-bruma/60">Link na bio.</p>
            </div>
          </SlideFrame>
        </div>
      </section>

      {/* ========== Template 1.2 — Post estático "Confessa" ========== */}
      <section>
        <p className="mb-4 text-sm text-neutral-400">Template 1.2 — Post estático "Confessa"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Post único">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <span className="mb-6 text-5xl">🫠</span>
              <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.15] text-white">
                Confessa: quantos grupos você deixou de enviar hoje por preguiça de copiar e colar?
              </h2>
            </div>
          </SlideFrame>
        </div>
      </section>

      {/* ========== CATEGORIA 2 — SOLUÇÃO / RECURSO ========== */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-iris-claro">Categoria 2 — Solução / Recurso</h2>

        {/* Template 2.2 — "Sabia que..." */}
        <p className="mb-4 text-sm text-neutral-400">Template 2.2 — Post "Sabia que..."</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Post único">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <span className="mb-6 text-4xl">🔄</span>
              <h2 className="font-display text-[1.65rem] font-extrabold leading-[1.15] text-white">
                Sabia que quando um grupo lota, o HubFlow cria o próximo sozinho?
              </h2>
              <p className="mt-4 text-sm text-bruma/50">Auto-criação de grupos</p>
            </div>
          </SlideFrame>
        </div>
      </section>

      {/* ========== Template 2.3 — Carrossel 5 coisas ========== */}
      <section>
        <p className="mb-4 text-sm text-neutral-400">Template 2.3 — Carrossel "5 coisas que o HubFlow faz"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Slide 1 — Capa">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <span className="mb-6 text-4xl">🌙</span>
              <h2 className="font-display text-[1.8rem] font-extrabold leading-[1.1] text-white">
                5 coisas que o HubFlow faz enquanto você dorme
              </h2>
            </div>
          </SlideFrame>

          {[
            { n: "01", text: "Dispara pra todos os grupos num clique" },
            { n: "02", text: "Agenda a semana inteira de uma vez" },
            { n: "03", text: "Cria grupo novo quando o atual enche" },
            { n: "04", text: "Muda nome e foto de todos em massa" },
            { n: "05", text: "Mostra funil e saúde em tempo real" },
          ].map((item) => (
            <SlideFrame key={item.n} label={`Slide ${item.n}`}>
              <div className="flex h-full flex-col items-center justify-center px-10 text-center">
                <span className="font-data mb-4 text-6xl font-bold text-iris/40">{item.n}</span>
                <p className="text-xl font-medium text-white">{item.text}</p>
              </div>
            </SlideFrame>
          ))}

          <SlideFrame label="Slide CTA">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <p className="font-data mb-3 text-xs uppercase tracking-[0.2em] text-iris-claro">
                O fluxo que vende.
              </p>
              <h2 className="font-display text-3xl font-extrabold text-white">
                Teste 7 dias grátis
              </h2>
              <p className="mt-3 text-bruma/60">→ link na bio</p>
            </div>
          </SlideFrame>
        </div>
      </section>

      {/* ========== CATEGORIA 3 — PROVA SOCIAL ========== */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-iris-claro">Categoria 3 — Prova Social</h2>
        <p className="mb-4 text-sm text-neutral-400">Template 3.1 — Post "Número destaque"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Post único">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <p className="font-display text-7xl font-extrabold tracking-tight text-iris-claro">2x</p>
              <p className="mt-4 text-xl font-medium text-white">mais faturamento.</p>
              <p className="text-xl text-bruma/60">Mesma equipe.</p>
              <p className="text-xl text-bruma/60">Um clique por dia.</p>
            </div>
          </SlideFrame>
        </div>
      </section>

      {/* ========== CATEGORIA 4 — URGÊNCIA / CTA ========== */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-iris-claro">Categoria 4 — Urgência / CTA</h2>

        <p className="mb-4 text-sm text-neutral-400">Template 4.1 — Post "Sem desculpa"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Post único">
            <div className="flex h-full flex-col justify-center gap-4 px-10">
              {[
                "Conecta em 2 minutos",
                "Sem cartão de crédito",
                "Sem trocar de número",
                "Seus contatos são seus",
              ].map((line) => (
                <div key={line} className="flex items-center gap-3">
                  <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                  <span className="text-lg text-white">{line}</span>
                </div>
              ))}
              <div className="mt-4 border-t border-white/10 pt-5 text-center">
                <p className="font-display text-xl font-bold text-bruma/80">Faltou desculpa.</p>
                <p className="font-display mt-1 text-2xl font-extrabold text-iris-claro">
                  Teste 7 dias grátis.
                </p>
              </div>
            </div>
          </SlideFrame>
        </div>

        <p className="mb-4 mt-8 text-sm text-neutral-400">Template 4.2 — Post "Quanto você perde"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Post único">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <p className="font-data text-sm uppercase tracking-[0.2em] text-bruma/50">Faz a conta</p>
              <p className="font-data mt-6 text-5xl font-bold text-white">20h</p>
              <p className="mt-2 text-lg text-bruma/60">por mês colando mensagem em grupo.</p>
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="font-display text-xl font-bold text-iris-claro">
                  Quanto vale sua hora?
                </p>
              </div>
            </div>
          </SlideFrame>
        </div>
      </section>

      {/* ========== CATEGORIA 5 — EDUCATIVO ========== */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-iris-claro">Categoria 5 — Educativo</h2>
        <p className="mb-4 text-sm text-neutral-400">Template 5.2 — Post "Dado do dia"</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SlideFrame label="Post único">
            <div className="flex h-full flex-col items-center justify-center px-10 text-center">
              <p className="font-data text-6xl font-bold text-iris-claro">78%</p>
              <p className="mt-4 text-lg text-white">dos brasileiros preferem comprar por WhatsApp.</p>
              <p className="font-data mt-3 text-xs text-bruma/40">(Opinion Box, 2025)</p>
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="font-display text-xl font-bold text-white">
                  Seus grupos estão prontos?
                </p>
              </div>
            </div>
          </SlideFrame>
        </div>
      </section>
    </div>
  );
}
