"use client";

import { useEffect, useState } from "react";
import { ContaVitrine } from "@/components/painel/configuracoes/vitrine/conta-vitrine";
import { toPlanLimitError, upgradeUrlFrom } from "@/lib/billing/plan-limit-client";
import {
  removalPrompt,
  removalSuccess,
} from "@/lib/auth/member-removal";
import { authenticatedFetch } from "@/lib/supabase/client";
import { subscriptionAccess, subscriptionNotice } from "@/lib/billing/subscription-access";
import { SEGMENTS } from "@/lib/segments";
import { ConfiguracoesVitrine } from "@/components/painel/configuracoes/vitrine/configuracoes-vitrine";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useRole } from "@/components/painel/role-provider";

type Section = "Conexão" | "Equipe" | "Notificações" | "Plano" | "Conta";
/**
 * Chave curta usada no `?secao=` da URL. O rodapé do e-mail semanal promete
 * "Desative em Configurações" — sem isso o link cai na página e a pessoa
 * precisa adivinhar em qual aba está o toggle.
 */
const SECAO_POR_SLUG: Record<string, Section> = {
  conexao: "Conexão",
  equipe: "Equipe",
  notificacoes: "Notificações",
  plano: "Plano",
  conta: "Conta",
};

/**
 * Preferências de aviso. A chave é o nome do campo no `PATCH /api/settings` —
 * assim o toggle manda `{ [key]: valor }` sem tabela de tradução no meio.
 */
type PreferenciaKey = "weeklyReportEnabled" | "disconnectAlertEnabled" | "broadcastAlertEnabled";
type Preferencias = Record<PreferenciaKey, boolean>;

const PREFERENCIAS: { key: PreferenciaKey; titulo: string; desc: string; aria: string }[] = [
  {
    key: "weeklyReportEnabled",
    titulo: "Resumo semanal",
    desc: "Toda segunda, o que seus grupos e campanhas fizeram na semana.",
    aria: "Receber o resumo semanal por e-mail",
  },
  {
    key: "disconnectAlertEnabled",
    titulo: "WhatsApp desconectado",
    desc: "Avisamos quando o número cai e fica mais de 2h fora do ar.",
    aria: "Receber aviso de WhatsApp desconectado por e-mail",
  },
  {
    key: "broadcastAlertEnabled",
    titulo: "Disparo com falha",
    desc: "Avisamos quando um disparo não chega aos grupos.",
    aria: "Receber aviso de disparo com falha por e-mail",
  },
];

// Todo aviso nasce ligado: resposta ausente ou quebrada não pode virar
// "desligado" na tela, senão o lojista acha que optou por algo que não optou.
function lerPreferencias(d: Partial<Preferencias> | null): Preferencias {
  return {
    weeklyReportEnabled: d?.weeklyReportEnabled ?? true,
    disconnectAlertEnabled: d?.disconnectAlertEnabled ?? true,
    broadcastAlertEnabled: d?.broadcastAlertEnabled ?? true,
  };
}

type Session = { live?: boolean; phone?: string | null; profileName?: string | null; stats?: { warmup?: { day?: number; totalDays?: number } } };
type Membership = { id: string; role: string; invited_email?: string | null; accepted_at?: string | null };
type Plan = { id: string; code: string; name: string; limits?: Record<string, number | boolean | null>; stripe_price_id?: string | null };
// A rota faz `select("*, plans(*)")`, entao `metadata` e `current_period_end` ja
// vinham no payload — era o tipo local que os escondia. Sem os dois nao da para
// separar boleto emitido (que CONCEDE acesso) de cobranca falhada, e a tela
// acabava afirmando o plano pelo `plan_id`, que e o plano ESCOLHIDO, nao o pago.
type Subscription = {
  status?: string;
  plans?: { name?: string; code?: string } | null;
  plan?: { name?: string; code?: string };
  metadata?: { stripe_status?: string | null } | null;
  current_period_end?: string | null;
} | null;

/**
 * Estado de cada consulta da tela. Tres valores, nao dois: "ainda nao voltou" e
 * "voltou com falha" pedem telas diferentes — tratar o primeiro como o segundo
 * mostra "Nao deu para carregar" a quem so esperou meio segundo.
 */
type Carga = "carregando" | "ok" | "erro";
type ChaveDaCarga = "settings" | "session" | "members" | "plans" | "sub";

export default function PainelConfiguracoes() {
  // A casca já carregou o papel: a porta "Conta" o mostra em português sem
  // custar uma consulta nova.
  const { role } = useRole();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [section, setSection] = useState<Section>("Conexão");
  const [session, setSession] = useState<Session>({});
  const [members, setMembers] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  // Erro de checkout/portal. Compartilhado pelos dois porque só um roda por vez
  // e ambos aparecem no mesmo painel.
  const [billingError, setBillingError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUpgradeUrl, setInviteUpgradeUrl] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);
  // `null` = ainda carregando (a UI mostra skeleton em vez de chutar um estado
  // e piscar quando a resposta chegar).
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  // Guarda QUAL preferência está salvando, para desabilitar só aquele toggle.
  const [prefBusy, setPrefBusy] = useState<PreferenciaKey | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);
  // Ramo do tenant (packs de conteúdo). `undefined` = carregando → skeleton.
  const [segment, setSegment] = useState<string | null | undefined>(undefined);
  const [segmentBusy, setSegmentBusy] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  /**
   * Quais consultas responderam bem.
   *
   * Os cinco fetches desta tela têm `catch` silencioso, então lista vazia e
   * `live: false` chegavam iguais quer o dado fosse esse, quer a rota tivesse
   * caído — e a tela afirmava "Desconectado" e "Só você por enquanto" nos dois
   * casos. As portas da Vitrine preferem não escrever nada a escrever o que não
   * sabem.
   */
  const [respondeu, setRespondeu] = useState<Record<ChaveDaCarga, Carga>>({
    settings: "carregando",
    session: "carregando",
    members: "carregando",
    plans: "carregando",
    sub: "carregando",
  });

  // Deep-link `?secao=notificacoes` do rodapé do e-mail. Lido de
  // `window.location` em vez de `useSearchParams` para não exigir uma fronteira
  // de Suspense nesta página inteira só por causa de um parâmetro opcional.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("secao");
    const alvo = slug ? SECAO_POR_SLUG[slug.toLowerCase()] : undefined;
    if (alvo) setSection(alvo);
  }, []);

  useEffect(() => {
    authenticatedFetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error("settings");
        return r.json();
      })
      .then((d) => {
        setPrefs(lerPreferencias(d));
        setSegment(typeof d?.segment === "string" ? d.segment : null);
        setRespondeu((o) => ({ ...o, settings: "ok" }));
      })
      .catch(() => {
        setPrefs(lerPreferencias(null));
        setSegment(null);
        setRespondeu((o) => ({ ...o, settings: "erro" }));
      });
    fetch("/api/session")
      .then((r) => {
        if (!r.ok) throw new Error("session");
        return r.json();
      })
      .then((d) => {
        setSession(d);
        setRespondeu((o) => ({ ...o, session: "ok" }));
      })
      .catch(() => setRespondeu((o) => ({ ...o, session: "erro" })));
    fetch("/api/members")
      .then((r) => {
        if (!r.ok) throw new Error("members");
        return r.json();
      })
      .then((d) => {
        setMembers(Array.isArray(d) ? d : d?.members ?? []);
        setRespondeu((o) => ({ ...o, members: "ok" }));
      })
      .catch(() => setRespondeu((o) => ({ ...o, members: "erro" })));
    fetch("/api/plans")
      .then((r) => {
        if (!r.ok) throw new Error("plans");
        return r.json();
      })
      .then((d) => {
        setPlans(Array.isArray(d) ? d : []);
        setRespondeu((o) => ({ ...o, plans: "ok" }));
      })
      .catch(() => setRespondeu((o) => ({ ...o, plans: "erro" })));
    authenticatedFetch("/api/subscription")
      .then((r) => {
        if (!r.ok) throw new Error("subscription");
        return r.json();
      })
      .then((d) => {
        setSub(d);
        setRespondeu((o) => ({ ...o, sub: "ok" }));
      })
      .catch(() => setRespondeu((o) => ({ ...o, sub: "erro" })));
  }, []);

  const live = session.live === true;
  const currentPlanCode = sub?.plans?.code ?? sub?.plan?.code ?? null;
  const currentPlanName = sub?.plans?.name ?? sub?.plan?.name ?? null;
  /**
   * O plano que a assinatura APONTA nao e o plano que vale.
   *
   * `plan_id` guarda o que o cliente escolheu no checkout, e continua apontando
   * para la mesmo quando o pagamento nunca compensou. Sem cruzar com o estado da
   * assinatura, esta tela dizia "Voce esta no plano Growth" para quem estava com
   * `canceled` e teto zero — e o cliente lia isso como promessa, tomava 402 em
   * tudo e nao tinha como ligar uma coisa na outra. O sidebar ja cruzava; era so
   * esta tela que afirmava sozinha.
   */
  const acessoPlano = sub
    ? subscriptionAccess(
        {
          status: sub.status ?? null,
          stripeStatus: sub.metadata?.stripe_status ?? null,
          periodEnd: sub.current_period_end ?? null,
        },
        new Date(),
      )
    : null;
  const planoVigente = acessoPlano?.grantsPlan ?? false;

  async function togglePref(key: PreferenciaKey, proximo: boolean) {
    const anterior = prefs;
    if (!anterior) return;
    setPrefs({ ...anterior, [key]: proximo }); // otimista: o toggle responde na hora
    setPrefBusy(key);
    setPrefError(null);
    try {
      const res = await authenticatedFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: proximo }),
      });
      if (!res.ok) throw new Error("falhou");
    } catch {
      // Sem o rollback o toggle mostraria "desativado" e o e-mail continuaria
      // chegando — exatamente o tipo de mentira de UI que este PR remove.
      setPrefs(anterior);
      setPrefError("Não foi possível salvar. Tente de novo.");
    } finally {
      setPrefBusy(null);
    }
  }

  async function saveSegment(valor: string) {
    const proximo = valor === "" ? null : valor;
    const anterior = segment;
    setSegment(proximo); // otimista, como os toggles acima
    setSegmentBusy(true);
    setSegmentError(null);
    try {
      const res = await authenticatedFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: proximo }),
      });
      if (!res.ok) throw new Error("falhou");
    } catch {
      // Rollback pelo mesmo motivo dos toggles: select mostrando um ramo que
      // não foi salvo entregaria a biblioteca errada sem ninguém perceber.
      setSegment(anterior);
      setSegmentError("Não foi possível salvar. Tente de novo.");
    } finally {
      setSegmentBusy(false);
    }
  }

  async function openCheckout(planCode: string) {
    setBusyPlan(planCode);
    setBillingError(null);
    try {
      const res = await authenticatedFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponível.");
      window.location.href = data.url;
    } catch (e) {
      // Engolir aqui apagava o único sinal que existia: o botão girava, parava,
      // e a tela ficava idêntica a antes do clique. Preço configurado errado,
      // plano inativo e Stripe fora do ar tinham todos a mesma cara de nada —
      // inclusive para o suporte, porque o cliente só sabe dizer "não acontece".
      setBillingError(e instanceof Error ? e.message : "Não foi possível abrir o checkout.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    setBillingError(null);
    try {
      const res = await authenticatedFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      // Antes isto era um `return` seco: resposta sem URL saía pelo mesmo caminho
      // do sucesso, então quem clicava em "Portal Stripe" não recebia nem erro
      // nem redirecionamento.
      if (!res.ok || !data.url) throw new Error(data.error || "Portal indisponível.");
      window.location.href = data.url;
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : "Não foi possível abrir o portal.");
    } finally {
      setPortalBusy(false);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await authenticatedFetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: "operator" }),
      });
      if (!res.ok) {
        throw await toPlanLimitError(res, "Erro ao convidar.");
      }
      const newMember = await res.json();
      setMembers((prev) => [...prev, newMember]);
      setInviteEmail("");
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Erro ao convidar.");
      setInviteUpgradeUrl(upgradeUrlFrom(e));
    } finally {
      setInviteBusy(false);
    }
  }

  async function removeMember(m: Membership) {
    const removendo = Boolean(m.accepted_at);
    const ok = await pedirConfirmacao({
      titulo: removendo ? "Remover da equipe" : "Revogar o convite",
      texto: removalPrompt(m),
      rotulo: removendo ? "Remover" : "Revogar",
      destrutivo: true,
    });
    if (!ok) return;
    setRemovingId(m.id);
    setInviteError(null);
    setRemoveNotice(null);
    try {
      const res = await authenticatedFetch(`/api/members?id=${encodeURIComponent(m.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // O servidor é a autoridade sobre quem pode remover quem (auto-remoção,
        // admin × dono, último dono). A tela mostra o motivo que veio de lá.
        throw new Error(d.error || "Erro ao remover.");
      }
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      setRemoveNotice(removalSuccess(m));
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setRemovingId(null);
    }
  }

  // As portas com o dado de cada uma antes do clique (Vitrine Aberta, PR 9).
  const aceitos = members.filter((m) => m.accepted_at).length;
  return (
    <>
    <ConfiguracoesVitrine
      porta={section}
      onPorta={setSection}
      leitura={{
        conexao: { ok: respondeu.session === "ok", live },
        equipe: { ok: respondeu.members === "ok", aceitos, pendentes: members.length - aceitos },
        avisos: {
          ok: respondeu.settings === "ok",
          ligados: prefs ? PREFERENCIAS.filter((p) => prefs[p.key]).length : 0,
          total: PREFERENCIAS.length,
        },
        plano: { ok: respondeu.sub === "ok", nome: currentPlanName, vigente: planoVigente },
        conta: { papel: role },
      }}
      conexao={{ carga: respondeu.session, live, telefone: session.phone ?? null }}
      equipe={{
        membros: members,
        carga: respondeu.members,
        email: inviteEmail,
        onEmail: setInviteEmail,
        convidando: inviteBusy,
        erro: inviteError,
        upgradeUrl: inviteUpgradeUrl,
        aviso: removeNotice,
        removendoId: removingId,
        onConvidar: () => void inviteMember(),
        onRemover: (m) => void removeMember(m),
      }}
      avisos={{
        preferencias: prefs,
        itens: PREFERENCIAS,
        salvando: prefBusy,
        erro: prefError,
        onAlternar: (key, proximo) => void togglePref(key as PreferenciaKey, proximo),
      }}
      plano={{
        carga: respondeu.sub,
        nome: currentPlanName,
        codigo: currentPlanCode,
        vigente: planoVigente,
        recado: acessoPlano ? subscriptionNotice(acessoPlano.state) : null,
        renovaEm: sub?.current_period_end ?? null,
        planos: respondeu.plans === "ok" ? plans : [],
        cargaDosPlanos: respondeu.plans,
        assinando: busyPlan,
        abrindoPortal: portalBusy,
        erro: billingError,
        onAssinar: (codigo) => void openCheckout(codigo),
        onPortal: () => void openPortal(),
      }}
      conta={
        <>
          <label htmlFor="segmento" className="block text-[14px] text-volt-950">
            Seu ramo
          </label>
          <p className="mt-0.5 text-13 text-slate-600">
            Ajusta os modelos de mensagem da biblioteca pro seu tipo de negócio.
          </p>
          {segment === undefined ? (
            <span
              className="pn-skeleton mt-2 block h-12 w-full max-w-sm rounded-[var(--radius-control)]"
              data-testid="painel-skeleton"
              role="status"
              aria-label="Carregando o ramo"
            />
          ) : (
            <select
              id="segmento"
              value={segment ?? ""}
              disabled={segmentBusy}
              onChange={(e) => saveSegment(e.target.value)}
              className="mt-2 block h-12 w-full max-w-sm rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 text-[16px] text-volt-950 disabled:opacity-60"
            >
              <option value="">Ainda não escolhi</option>
              {SEGMENTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {segmentError && (
            <p role="alert" className="mt-2 text-13 text-danger-700">
              {segmentError}
            </p>
          )}
          <div className="mt-6 border-t border-line-200 pt-5">
            <ContaVitrine />
          </div>
        </>
      }
    />
    {folhaDeConfirmacao}
    </>
  );
}
