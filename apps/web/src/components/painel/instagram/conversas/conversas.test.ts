import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { estadoDoCampo } from "@/lib/ig/conversas/tela";
import type { ConversaDto, MensagemDto } from "@/lib/ig/conversas/tipos";
import type { FichaDaPessoa } from "@/lib/ig/pessoas-tipos";
import { AbasInstagram } from "../abas";
import { Bolha } from "./bolha";
import { CampoDeResposta } from "./campo-de-resposta";
import { FichaResumida } from "./ficha-resumida";
import { ListaDeConversas } from "./lista-de-conversas";

const noop = () => {};
const AGORA = new Date();
const ha = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();

const conversa = (id: string, extra: Partial<ConversaDto> = {}): ConversaDto => ({ id, username: `loja.${id}`, nome: null, situacao: "open", pedido: false, naoLidas: 0, ultimaEm: ha(1), ultimaDirecao: "in", previa: "oi, tudo bem?", roboPausadoAte: null, ...extra });
const msg = (extra: Partial<MensagemDto> = {}): MensagemDto => ({ id: "m1", direcao: "in", texto: "oi", criadaEm: ha(1), autor: null, runId: null, anexos: [], respostaDeStory: false, mencaoEmStory: false, apagada: false, ...extra });

const lista = (itens: ConversaDto[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ListaDeConversas, { itens, abertaId: null, filtro: { busca: "", etiqueta: "" }, aguardando: 0, etiquetaParcial: false, carga: "ok", maisFalhou: false, temMais: false, varredura: { estado: "parada", parcial: false, novas: 0 }, aoMudarFiltro: noop, aoAbrir: noop, aoVerMais: noop, aoAtualizar: noop, aoTentarDeNovo: noop, ...extra }),
  );

test("a lista é uma nav com ul, marca a conversa atual e mostra Aguardando você, não lidas e o contador", () => {
  const h = lista([conversa("a", { situacao: "waiting", naoLidas: 2 }), conversa("b")], { abertaId: "a", aguardando: 1 });
  assert.match(h, /<nav aria-label="Conversas"/);
  assert.match(h, /<ul>/);
  assert.equal((h.match(/aria-current="true"/g) ?? []).length, 1, "só a conversa aberta é a atual");
  assert.match(h, /@loja\.a<\/span>/);
  assert.match(h, /2<span class="sr-only"> não lidas<\/span>/, "o nome acessível leva prévia, hora e não lidas");
  assert.match(h, /data-conversa-id="a"/);
  assert.doesNotMatch(h, /<button[^>]*aria-label="@loja/, "aria-label esconderia a prévia e a hora");
  assert.match(h, />Aguardando você</);
});

test("os filtros são botões com aria-pressed e a busca e a etiqueta têm rótulo", () => {
  const h = lista([conversa("a")], { filtro: { busca: "", etiqueta: "", status: "waiting" } });
  assert.match(h, /aria-pressed="true"[^>]*>Aguardando você/);
  assert.match(h, /aria-pressed="false"[^>]*>Abertas/);
  assert.match(h, /Não lidas/);
  assert.match(h, /Resolvidas/);
  assert.doesNotMatch(h, /Pedidos/, "o filtro de pedidos não entra neste PR");
  assert.match(h, /Buscar por @/);
  assert.match(h, />Etiqueta</);
});

test("lista vazia explica; com filtro diz que nenhuma bate; varrendo mostra o progresso", () => {
  assert.match(lista([]), /Nenhuma conversa ainda/);
  assert.match(lista([], { filtro: { busca: "x", etiqueta: "" } }), /Nenhuma conversa com esses filtros/);
  const h = lista([], { varredura: { estado: "rodando", parcial: false, novas: 0 } });
  assert.match(h, /Importando as conversas do Instagram/);
  assert.doesNotMatch(h, /Nenhuma conversa ainda/);
  assert.match(h, /Atualizando…/);
});

test("429 da varredura vira aviso e o erro da lista tem role alert", () => {
  assert.match(lista([], { varredura: { estado: "cedo", parcial: false, novas: 0 } }), /atualizada há pouco/);
  assert.match(lista([], { carga: "erro" }), /role="alert"[^>]*>Não deu pra carregar as conversas/);
});

test("a bolha nossa leva o rótulo do evento; a dela, nenhum; anexo aponta para a rota de mídia", () => {
  const robo = renderToStaticMarkup(createElement(Bolha, { conversaId: "c1", mensagem: msg({ direcao: "out", autor: "robo" }) }));
  assert.match(robo, /Robô · /);
  const voce = renderToStaticMarkup(createElement(Bolha, { conversaId: "c1", mensagem: msg({ direcao: "out", autor: "voce" }) }));
  assert.match(voce, /Você · /);
  const dela = renderToStaticMarkup(createElement(Bolha, { conversaId: "c1", mensagem: msg({ autor: "robo" }) }));
  assert.doesNotMatch(dela, /Robô|Você/);
  const midia = renderToStaticMarkup(createElement(Bolha, { conversaId: "c1", mensagem: msg({ id: "mid/1", anexos: [{ indice: 0, tipo: "audio", mime: "audio/mp4", nome: null }, { indice: 1, tipo: "image", mime: "image/jpeg", nome: null }, { indice: 2, tipo: "video", mime: "video/mp4", nome: null }] }) }));
  assert.match(midia, /<audio src="\/api\/ig\/conversations\/c1\/media\?mid=mid%2F1&amp;i=0"/);
  assert.match(midia, /<img src="\/api\/ig\/conversations\/c1\/media\?mid=mid%2F1&amp;i=1"/);
  assert.match(midia, /<video src="\/api\/ig\/conversations\/c1\/media\?mid=mid%2F1&amp;i=2"/);
  assert.doesNotMatch(midia, /https?:\/\//, "nenhuma URL da Zernio na tela");
});

const campo = (janela: Parameters<typeof estadoDoCampo>[0], pausa: string | null = null) =>
  renderToStaticMarkup(createElement(CampoDeResposta, { estado: estadoDoCampo(janela, pausa, AGORA), quem: "@ana", aoEnviar: async () => ({ ok: true as const }), aoRetomar: async () => ({ ok: true as const }) }));

test("campo: janela aberta envia como Enviar e o textarea tem rótulo", () => {
  const h = campo({ estado: "aberta", ultimaDelaEm: ha(2) });
  assert.match(h, /Responder @ana/);
  assert.match(h, />Enviar</);
  assert.doesNotMatch(h, /Enviar como atendimento/);
  assert.doesNotMatch(h, /<textarea[^>]* disabled=""/);
  assert.match(h, /robô pausa aqui por 12 h/);
});

test("campo: de 24 h a 7 dias avisa e oferece Enviar como atendimento", () => {
  const h = campo({ estado: "humano", ultimaDelaEm: ha(50) });
  assert.match(h, /Passou de 24 h, ainda dentro de 7 dias/);
  assert.match(h, />Enviar como atendimento</);
  assert.match(h, /o robô não manda nada nesse período/);
});

test("campo: janela fechada desabilita o texto e o botão e explica", () => {
  const h = campo({ estado: "fechada", ultimaDelaEm: ha(24 * 9) });
  assert.match(h, /<textarea[^>]* disabled=""/);
  assert.match(h, /<button[^>]* disabled=""[^>]*>Enviar</);
  assert.match(h, /não deixa a loja escrever primeiro/);
});

test("campo: robô pausado mostra a faixa com Retomar agora", () => {
  const h = campo({ estado: "aberta", ultimaDelaEm: ha(2) }, new Date(AGORA.getTime() + 3_600_000).toISOString());
  assert.match(h, /Robô pausado até/);
  assert.match(h, />Retomar agora</);
  assert.match(h, /Volta sozinho depois de 12 h/);
  assert.doesNotMatch(campo({ estado: "aberta", ultimaDelaEm: ha(2) }), /Retomar agora/);
});

const fichaDa = (extra: Partial<FichaDaPessoa["pessoa"]> = {}): FichaDaPessoa => ({
  pessoa: { id: "p1", username: "loja.a", fields: { tamanho: "Infantil" }, tags: ["quer-infantil"], firstSeenAt: ha(500), lastSeenAt: ha(1), lastDmAt: ha(1), sourceFlowId: null, sourceFlowName: null, ...extra },
  atendimentos: [{ id: "r1", flowId: "f1", flowName: "Comentou, escolhe o grupo", sourceKind: "comment", matchedKeyword: "quero", status: "done", errorText: "", startedAt: ha(2) }],
});

test("a ficha resumida mostra campos, etiquetas, fluxos e leva à ficha completa em Pessoas", () => {
  const h = renderToStaticMarkup(createElement(FichaResumida, { quem: "@loja.a", carga: "ok", ficha: fichaDa(), aoEditarEtiquetas: async () => null, aoTentarDeNovo: noop }));
  assert.match(h, /aria-label="Ficha de @loja\.a"/);
  assert.match(h, /<dt[^>]*>Tamanho<\/dt><dd[^>]*>Infantil/);
  assert.match(h, /Tirar a etiqueta quer-infantil/);
  assert.match(h, /Comentou, escolhe o grupo/);
  assert.match(h, /href="\/painel\/instagram\/pessoas"[^>]*>Abrir ficha completa/);
  assert.doesNotMatch(h, /Pedidos/);
  assert.match(renderToStaticMarkup(createElement(FichaResumida, { quem: "@x", carga: "sem-ficha", ficha: null, aoEditarEtiquetas: async () => null, aoTentarDeNovo: noop })), /ainda não tem ficha/);
});

test("as abas têm Conversas primeiro (padrão, com contador), Fluxos em /fluxos e Pessoas", () => {
  const h = renderToStaticMarkup(createElement(AbasInstagram, { ativa: "conversas", aguardando: 4 }));
  assert.match(h, /aria-current="page"[^>]*href="\/painel\/instagram">Conversas/);
  assert.match(h, /4<span class="sr-only"> aguardando você/);
  assert.ok(h.indexOf("Conversas") < h.indexOf("Fluxos") && h.indexOf("Fluxos") < h.indexOf("Pessoas"));
  assert.match(h, /href="\/painel\/instagram\/fluxos"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(AbasInstagram, { ativa: "pessoas" })), /aguardando você/);
});
