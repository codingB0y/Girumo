import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadoGrupo } from "@/lib/groups/estado";
import { paradoDoLink } from "@/lib/painel/link-parado";
import { ENTRADA_DEFAULTS } from "@/lib/campaigns/settings";
import { hrefDaCampanha, linkParadoDaCampanha, type CampanhaDoAviso } from "./link-parado-aviso";
import { linkParadoEmail } from "./templates";

/** 12h de 10/11 em Brasília. */
const AGORA = new Date("2026-11-10T15:00:00Z");

function grupo(p: Pick<EstadoGrupo, "posicao" | "estado"> & Partial<EstadoGrupo>): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-${String(p.posicao).padStart(12, "0")}`,
    whatsappGroupId: `g${p.posicao}@g.us`,
    nome: `Moda Kids ${p.posicao}`,
    membros: 100,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/C${p.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: { menos_enchendo: false, lotados: false, com_gente: false },
    ...p,
  };
}

function campanha(grupos: EstadoGrupo[], entrada: Record<string, unknown> = {}): CampanhaDoAviso {
  return {
    name: "Black Friday",
    slug: "black-friday",
    group_ids: grupos.map((g) => g.whatsappGroupId),
    metadata: { settings: { entrada } },
  };
}

test("link que manda para um grupo não gera aviso", () => {
  const gs = [grupo({ posicao: 1, estado: "enchendo" })];
  assert.equal(linkParadoDaCampanha(campanha(gs), gs, AGORA), null);
});

test("número sem admin em nenhum grupo vira aviso com a frase da aba", () => {
  const gs = [grupo({ posicao: 1, estado: "lotado", isAdmin: false }), grupo({ posicao: 2, estado: "lotado", isAdmin: false })];
  const aviso = linkParadoDaCampanha(campanha(gs), gs, AGORA);
  assert.deepEqual(aviso, {
    nome: "Black Friday",
    // A mesma frase de `paradoDoLink`, sem cópia do texto aqui.
    texto: paradoDoLink("no-admin", campanha(gs).group_ids, 1, ENTRADA_DEFAULTS.lotado).texto,
    href: "/painel/campanhas/black-friday",
  });
});

test("grupos sem convite e grupos que saíram da conta viram aviso", () => {
  const semConvite = [grupo({ posicao: 1, estado: "lotado", inviteUrl: null })];
  assert.match(linkParadoDaCampanha(campanha(semConvite), semConvite, AGORA)?.texto ?? "", /convite/);
  // A RPC só devolve grupo que existe em `groups`: pool com JID e resposta vazia = saíram.
  const sumiram = campanha([grupo({ posicao: 1, estado: "enchendo" })]);
  assert.match(linkParadoDaCampanha(sumiram, [], AGORA)?.texto ?? "", /não estão mais na sua conta/);
});

test("todos cheios só avisa quando quem clica não fica guardado em lugar nenhum", () => {
  const cheios = [grupo({ posicao: 1, estado: "lotado", membros: 1000 })];
  assert.match(linkParadoDaCampanha(campanha(cheios), cheios, AGORA)?.texto ?? "", /vê o aviso de que os grupos estão cheios/);
  const comLista = campanha(cheios, { lotado: { modo: "pagina", pagina_slug: "espera" } });
  assert.equal(linkParadoDaCampanha(comLista, cheios, AGORA), null);
});

test("campanha encerrada pela data não é problema a avisar", () => {
  const gs = [grupo({ posicao: 1, estado: "enchendo" })];
  assert.equal(linkParadoDaCampanha(campanha(gs, { encerra_em: "2026-11-09" }), gs, AGORA), null);
});

test("o href escapa o slug", () => {
  assert.equal(hrefDaCampanha("a b/c"), "/painel/campanhas/a%20b%2Fc");
});

test("e-mail de link parado: uma campanha leva o motivo e o link direto", () => {
  const texto = paradoDoLink("no-invite", ["g1@g.us"], 1, ENTRADA_DEFAULTS.lotado).texto;
  const { subject, html } = linkParadoEmail("Ana Souza", "https://app.x", [{ nome: "Black Friday", texto, href: "/painel/campanhas/black-friday" }]);
  assert.equal(subject, "O link da campanha Black Friday parou de mandar gente para o grupo");
  assert.match(html, /Oi Ana!/);
  assert.ok(html.includes(texto));
  assert.match(html, /href="https:\/\/app\.x\/painel\/campanhas\/black-friday"[^>]*>Abrir a campanha/);
});

test("e-mail de link parado: várias campanhas, nomes escapados e assunto sem quebra de linha", () => {
  const malicioso = 'VIP</strong><a href="https://golpe.x">x</a>';
  const { subject, html } = linkParadoEmail("Bia", "https://app.x", [
    { nome: `${malicioso}\nBcc: a@b`, texto: "Motivo A.", href: "/painel/campanhas/a" },
    { nome: "Outra", texto: "Motivo B.", href: "/painel/campanhas/b" },
  ]);
  assert.equal(subject, "Os links de 2 campanhas pararam de mandar gente para o grupo");
  assert.doesNotMatch(html, /<a href="https:\/\/golpe\.x"/);
  assert.match(html, /href="https:\/\/app\.x\/painel\/campanhas\/b"/);
  assert.match(html, /href="https:\/\/app\.x\/painel\/campanhas"[^>]*>Ver as campanhas/);
  const umaSo = linkParadoEmail("Bia", "https://app.x", [{ nome: "Black\r\n  Friday", texto: "x", href: "/painel/campanhas/a" }]);
  assert.equal(umaSo.subject, "O link da campanha Black Friday parou de mandar gente para o grupo");
});
