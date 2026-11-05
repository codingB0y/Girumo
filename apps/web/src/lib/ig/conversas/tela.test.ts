import assert from "node:assert/strict";
import { test } from "node:test";
import type { MarcaDoFio } from "./fio";
import { casaComFiltro, conversaDoRealtime, estadoDoCampo, itensDoFio, mesclarConversas, mesclarMensagens, proximoAoVivo, queryDaLista, rotuloDaBolha, textoDaMarca, tituloComContador, trocarPrimeiraPagina } from "./tela";
import type { ConversaDto, MensagemDto } from "./tipos";

const UTC = "UTC";
const AGORA = new Date("2026-10-20T15:00:00.000Z");

const msg = (id: string, criadaEm: string, extra: Partial<MensagemDto> = {}): MensagemDto => ({ id, direcao: "in", texto: id, criadaEm, autor: null, runId: null, anexos: [], respostaDeStory: false, mencaoEmStory: false, apagada: false, ...extra });
const conversa = (id: string, ultimaEm: string | null, extra: Partial<ConversaDto> = {}): ConversaDto => ({ id, username: id, nome: null, situacao: "open", pedido: false, naoLidas: 0, ultimaEm, ultimaDirecao: "in", previa: null, roboPausadoAte: null, ...extra });

test("rótulo da bolha vem do evento: Robô, Você, ou nenhum", () => {
  assert.equal(rotuloDaBolha({ direcao: "out", autor: "robo" }), "Robô");
  assert.equal(rotuloDaBolha({ direcao: "out", autor: "voce" }), "Você");
  assert.equal(rotuloDaBolha({ direcao: "out", autor: null }), null);
  assert.equal(rotuloDaBolha({ direcao: "in", autor: "robo" }), null, "bolha dela nunca leva rótulo");
});

test("mesclar mensagens não duplica por id, a nova vence e a ordem é cronológica", () => {
  const atuais = [msg("b", "2026-10-20T10:02:00Z"), msg("c", "2026-10-20T10:03:00Z")];
  const novas = [msg("a", "2026-10-20T10:01:00Z"), msg("b", "2026-10-20T10:02:00Z", { texto: "editada" })];
  const r = mesclarMensagens(atuais, novas);
  assert.deepEqual(r.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(r[1].texto, "editada");
});

test("mesclar conversas troca a linha pelo id e põe a mais recente em cima, sem data por último", () => {
  const r = mesclarConversas([conversa("x", "2026-10-20T10:00:00Z"), conversa("y", null), conversa("z", "2026-10-19T10:00:00Z")], [conversa("z", "2026-10-20T12:00:00Z", { naoLidas: 2 }), conversa("w", "2026-10-20T11:00:00Z")]);
  assert.deepEqual(r.map((c) => c.id), ["z", "w", "x", "y"]);
  assert.equal(r[0].naoLidas, 2);
});

test("as marcas entram no fio pelo horário dos eventos", () => {
  const marcas: MarcaDoFio[] = [
    { tipo: "waiting", motivo: null, em: "2026-10-20T10:02:30Z" },
    { tipo: "resolved", motivo: "loja", em: "2026-10-20T11:00:00Z" },
  ];
  const itens = itensDoFio([msg("a", "2026-10-20T10:00:00Z"), msg("b", "2026-10-20T10:02:00Z"), msg("c", "2026-10-20T10:03:00Z")], marcas, UTC);
  assert.deepEqual(itens.map((i) => (i.tipo === "mensagem" ? i.mensagem.id : i.texto)), ["a", "b", "Nenhum fluxo respondeu · aguardando você desde 10:02", "c", "Resolvida por você · 11:00"]);
});

test("o texto da marca muda com o motivo", () => {
  assert.equal(textoDaMarca({ tipo: "waiting", motivo: "handoff", em: "2026-10-20T10:00:00Z" }, UTC), "Um fluxo passou a conversa pra você · 10:00");
  assert.equal(textoDaMarca({ tipo: "paused", motivo: "pausado_pela_loja", em: "2026-10-20T10:00:00Z" }, UTC), "Robô pausa aqui · 10:00");
  assert.equal(textoDaMarca({ tipo: "paused", motivo: "retomado_pela_loja", em: "2026-10-20T10:00:00Z" }, UTC), "Robô retomado · 10:00");
  assert.match(textoDaMarca({ tipo: "resolved", motivo: "janela_fechou", em: "2026-10-20T10:00:00Z" }, UTC), /janela de 7 dias/);
});

test("campo de resposta: janela aberta envia normal e diz até quando", () => {
  const e = estadoDoCampo({ estado: "aberta", ultimaDelaEm: "2026-10-20T14:21:00Z" }, null, AGORA, UTC);
  assert.equal(e.modo, "aberta");
  assert.equal(e.podeEnviar, true);
  assert.equal(e.rotuloEnviar, "Enviar");
  assert.match(e.faixa, /até amanhã, 14:21/);
  assert.equal(e.pausadoAte, null);
});

test("campo de resposta: de 24 h a 7 dias manda como atendimento", () => {
  const e = estadoDoCampo({ estado: "humano", ultimaDelaEm: "2026-10-18T13:48:00Z" }, null, AGORA, UTC);
  assert.equal(e.podeEnviar, true);
  assert.equal(e.rotuloEnviar, "Enviar como atendimento");
  assert.match(e.nota, /há 2 dias/);
  assert.match(e.nota, /Até 25\/10, 13:48/);
});

test("campo de resposta: fechada desabilita e explica; sem data também fecha", () => {
  const e = estadoDoCampo({ estado: "fechada", ultimaDelaEm: "2026-10-11T13:48:00Z" }, null, AGORA, UTC);
  assert.equal(e.podeEnviar, false);
  assert.match(e.nota, /há 9 dias/);
  assert.match(e.nota, /não deixa a loja escrever primeiro/);
  const sem = estadoDoCampo({ estado: "aberta", ultimaDelaEm: null }, null, AGORA, UTC);
  assert.equal(sem.modo, "fechada", "estado aberto sem data nunca libera o envio");
  assert.equal(sem.podeEnviar, false);
});

test("campo de resposta: a pausa só vale enquanto o prazo não passou", () => {
  const janela = { estado: "aberta", ultimaDelaEm: "2026-10-20T14:21:00Z" } as const;
  assert.equal(estadoDoCampo(janela, "2026-10-21T02:21:00Z", AGORA, UTC).pausadoAte, "2026-10-21T02:21:00Z");
  assert.equal(estadoDoCampo(janela, "2026-10-20T10:00:00Z", AGORA, UTC).pausadoAte, null);
});

test("a linha do Realtime vira o mesmo DTO da rota; lixo vira null", () => {
  const c = conversaDoRealtime({ id: "1", username: "ana", display_name: "Ana", status: "waiting", folder: "inbox", unread_count: 3, last_message_at: "2026-10-20T14:00:00Z", last_direction: "in", last_preview: "oi", bot_paused_until: "2026-10-20T10:00:00Z" }, AGORA);
  assert.deepEqual(c, { id: "1", username: "ana", nome: "Ana", situacao: "waiting", pedido: false, naoLidas: 3, ultimaEm: "2026-10-20T14:00:00Z", ultimaDirecao: "in", previa: "oi", roboPausadoAte: null });
  assert.equal(conversaDoRealtime({ id: "1", status: "estranho" }, AGORA), null);
  assert.equal(conversaDoRealtime(null, AGORA), null);
});

test("a linha cabe no filtro pela situação, não lidas e @", () => {
  const c = conversa("1", null, { username: "ana.kids", situacao: "waiting", naoLidas: 1 });
  assert.equal(casaComFiltro(c, { busca: "", etiqueta: "", status: "waiting" }), true);
  assert.equal(casaComFiltro(c, { busca: "", etiqueta: "", status: "resolved" }), false);
  assert.equal(casaComFiltro(c, { busca: "@ANA", etiqueta: "", naoLidas: true }), true);
  assert.equal(casaComFiltro({ ...c, naoLidas: 0 }, { busca: "", etiqueta: "", naoLidas: true }), false);
  assert.equal(casaComFiltro(c, { busca: "bia", etiqueta: "" }), false);
});

test("a consulta da lista tira o @ e os vazios", () => {
  assert.equal(queryDaLista({ busca: " @ana ", etiqueta: "atacado", status: "waiting", naoLidas: true }, "50"), "status=waiting&naoLidas=1&busca=ana&etiqueta=atacado&cursor=50");
  assert.equal(queryDaLista({ busca: "", etiqueta: "" }), "");
});

test("título da aba leva (N) só quando alguém espera, sem acumular", () => {
  assert.equal(tituloComContador("Instagram — Girumo", 4), "(4) Instagram — Girumo");
  assert.equal(tituloComContador("(4) Instagram — Girumo", 5), "(5) Instagram — Girumo");
  assert.equal(tituloComContador("(4) Instagram — Girumo", 0), "Instagram — Girumo");
});

test("ao vivo: conecta, cai para a consulta e volta; 10 s sem conectar também cai", () => {
  assert.equal(proximoAoVivo("conectando", "inscrito"), "realtime");
  assert.equal(proximoAoVivo("conectando", "vencido"), "consulta");
  assert.equal(proximoAoVivo("realtime", "vencido"), "realtime", "o prazo só vale para quem ainda não conectou");
  assert.equal(proximoAoVivo("realtime", "caiu"), "consulta");
  assert.equal(proximoAoVivo("consulta", "inscrito"), "realtime");
});

test("recarga em silêncio troca a primeira página e guarda só as mais antigas já carregadas", () => {
  const velha = [conversa("a", "2026-10-20T12:00:00Z"), conversa("b", "2026-10-20T12:30:00Z"), conversa("c", "2026-10-20T09:00:00Z"), conversa("d", "2026-10-20T08:00:00Z")];
  // "b" saiu do filtro e "e" é nova; "c" e "d" vieram de uma segunda página.
  const primeira = [conversa("e", "2026-10-20T13:00:00Z"), conversa("a", "2026-10-20T12:00:00Z", { naoLidas: 1 })];
  assert.deepEqual(trocarPrimeiraPagina(velha, primeira, true).map((c) => c.id), ["e", "a", "c", "d"]);
  assert.deepEqual(trocarPrimeiraPagina(velha, primeira, false).map((c) => c.id), ["e", "a"], "sem próxima página a primeira é tudo");
});
