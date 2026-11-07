import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { estadoDoCampo } from "@/lib/ig/conversas/tela";
import type { RespostaPronta } from "@/lib/ig/conversas/campo";
import { PreviaDoAnexo } from "./anexo-do-campo";
import { CampoDeResposta } from "./campo-de-resposta";
import { ConviteDoGrupo } from "./convite-do-grupo";
import { GerenciarRespostas } from "./gerenciar-respostas";
import { ID_DA_LISTA, idDaOpcao, ListaDeRespostas } from "./respostas-prontas";

/** SSR dos extras do campo de resposta (spec §7.8 a §7.10). Mesmo estilo de conversas.test.ts. */

const noop = () => {};
const ok = async () => ({ ok: true as const });
const AGORA = new Date();
const ha = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();
const R = (id: string, titulo: string, texto = `texto ${id}`): RespostaPronta => ({ id, titulo, texto });
const RESPOSTAS = [R("a", "Prazo de envio", "Postamos em 2 dias."), R("b", "Preço")];

const campo = (janela: Parameters<typeof estadoDoCampo>[0]) =>
  renderToStaticMarkup(createElement(CampoDeResposta, { estado: estadoDoCampo(janela, null, AGORA), quem: "@ana", aoEnviar: ok, aoConvidar: ok, aoRetomar: ok }));

test("campo: os três botões do mockup, a dica do / e o seletor só de PNG, JPEG e MP4", () => {
  const h = campo({ estado: "aberta", ultimaDelaEm: ha(2) });
  for (const rotulo of ["Respostas prontas", "Convite do grupo"]) assert.match(h, new RegExp(`<button[^>]*>(?:<svg[^]*?</svg>)?${rotulo}</button>`), rotulo);
  assert.match(h, /<button[^>]*aria-label="Foto ou vídeo"[^>]*title="Foto ou vídeo"/, "só ícone: o nome acessível fica no aria-label");
  assert.match(h, /placeholder="Escreva a resposta ou digite \/ para as respostas prontas"/);
  assert.match(h, /<input[^>]*type="file"[^>]*accept="image\/png,image\/jpeg,video\/mp4"/);
  assert.match(h, /<input[^>]*aria-label="Escolher foto ou vídeo"/);
});

test("campo: Gerenciar respostas não aparece sem o papel de dono ou admin conhecido; a lista fechada não pinta nada", () => {
  const h = campo({ estado: "aberta", ultimaDelaEm: ha(2) });
  assert.doesNotMatch(h, /Gerenciar respostas/);
  assert.doesNotMatch(h, /role="listbox"/);
  assert.match(h, /<textarea[^>]*role="combobox"[^>]*aria-expanded="false"/, "o campo é sempre combobox; só anuncia aberto com opções na tela");
  assert.doesNotMatch(h, /aria-controls/);
});

test("campo: com a janela fechada os três botões ficam desabilitados", () => {
  const h = campo({ estado: "fechada", ultimaDelaEm: ha(24 * 9) });
  for (const rotulo of ["Respostas prontas", "Convite do grupo"]) assert.match(h, new RegExp(`<button[^>]* disabled=""[^>]*>(?:<svg[^]*?</svg>)?${rotulo}</button>`), rotulo);
  assert.match(h, /<button[^>]*aria-label="Foto ou vídeo"[^>]* disabled=""/);
});

const lista = (extra: Partial<Parameters<typeof ListaDeRespostas>[0]> = {}) =>
  renderToStaticMarkup(createElement(ListaDeRespostas, { itens: RESPOSTAS, total: 2, carga: "ok", ativo: 1, podeGerenciar: false, aoEscolher: noop, aoTentarDeNovo: noop, ...extra }));

test("a lista é um listbox de options, com a ativa em aria-selected e ids que o campo aponta", () => {
  const h = lista();
  assert.match(h, new RegExp(`<ul id="${ID_DA_LISTA}" role="listbox" aria-label="Respostas prontas"`));
  assert.equal((h.match(/role="option"/g) ?? []).length, 2);
  assert.match(h, new RegExp(`id="${idDaOpcao("a")}" role="option" aria-selected="false"`));
  assert.match(h, new RegExp(`id="${idDaOpcao("b")}" role="option" aria-selected="true"`));
  assert.match(h, /Prazo de envio/);
  assert.match(h, /Postamos em 2 dias\./);
});

test("a lista explica cada vazio: carregando, erro com nova tentativa, nenhuma ainda (por papel) e nenhuma com o nome", () => {
  assert.match(lista({ carga: "carregando", itens: [] }), /role="status"[^>]*>Carregando as respostas prontas/);
  assert.match(lista({ carga: "erro", itens: [] }), /role="alert"[^>]*>Não deu pra carregar as respostas prontas[\s\S]*Tentar de novo/);
  assert.match(lista({ total: 0, itens: [] }), /O dono ou um admin cria em Gerenciar/);
  assert.match(lista({ total: 0, itens: [], podeGerenciar: true }), /Crie a primeira em Gerenciar/);
  const semNome = lista({ itens: [] });
  assert.match(semNome, /Nenhuma resposta com esse nome/);
  assert.doesNotMatch(semNome, /role="listbox"/);
});

test("gerenciar: lista com Apagar nomeado por resposta, contador do teto de 50 e formulário com rótulos e limites", () => {
  const h = renderToStaticMarkup(createElement(GerenciarRespostas, { respostas: RESPOSTAS, carga: "ok", aoCriar: ok, aoApagar: ok, aoTentarDeNovo: noop, aoFechar: noop }));
  assert.match(h, /<section aria-labelledby="ig-gerenciar-respostas-titulo"/);
  assert.match(h, /<h3 id="ig-gerenciar-respostas-titulo"[^>]*>Gerenciar respostas prontas \(2\/50\)/);
  assert.match(h, /aria-label="Apagar Prazo de envio"/);
  assert.match(h, /Título[\s\S]*<input[^>]*maxLength="40"/);
  assert.match(h, /Texto da resposta[\s\S]*<textarea[^>]*maxLength="1000"/);
  assert.match(h, /<button[^>]* disabled=""[^>]*>Criar resposta</, "sem título e texto não cria");
  assert.doesNotMatch(h, /Editar/, "não há edição: apaga e cria");
  const carregando = renderToStaticMarkup(createElement(GerenciarRespostas, { respostas: [], carga: "carregando", aoCriar: ok, aoApagar: ok, aoTentarDeNovo: noop, aoFechar: noop }));
  assert.doesNotMatch(carregando, /\(0\/50\)/, "carregando não finge que são zero");
  assert.match(carregando, /role="status"[^>]*>Carregando as respostas prontas/);
  const erro = renderToStaticMarkup(createElement(GerenciarRespostas, { respostas: [], carga: "erro", aoCriar: ok, aoApagar: ok, aoTentarDeNovo: noop, aoFechar: noop }));
  assert.match(erro, /role="alert"[^>]*>Não deu pra carregar[\s\S]*Tentar de novo/);
});

test("convite: abre carregando as campanhas e só deixa enviar com uma escolhida", () => {
  const h = renderToStaticMarkup(createElement(ConviteDoGrupo, { aoConvidar: ok, aoFechar: noop }));
  assert.match(h, /<section aria-labelledby="ig-convite-do-grupo-titulo"/);
  assert.match(h, /<h3 id="ig-convite-do-grupo-titulo"[^>]*>Convite do grupo</);
  assert.match(h, /role="status"[^>]*>Carregando as campanhas/);
  assert.match(h, /<button[^>]* disabled=""[^>]*>Enviar convite</);
});

test("prévia: some sem arquivo, mostra a barra enquanto sobe, foto e vídeo depois com Remover", () => {
  const pre = (anexo: Parameters<typeof PreviaDoAnexo>[0]["anexo"]) => renderToStaticMarkup(createElement(PreviaDoAnexo, { anexo, aoRemover: noop }));
  assert.match(pre({ fase: "vazio" }), /<p role="status" class="sr-only"><\/p>/, "a região de status existe mesmo sem arquivo");
  assert.doesNotMatch(pre({ fase: "vazio" }), /<img|<video|<progress/);
  assert.match(pre({ fase: "enviando", nome: "a.png" }), /role="status"[^>]*>Enviando o arquivo[\s\S]*<progress aria-label="Enviando a\.png"/);
  const foto = pre({ fase: "pronto", nome: "a.png", tipo: "image", midiaId: "m", previa: "blob:http://x/1" });
  assert.match(foto, /<img src="blob:http:\/\/x\/1" alt="Prévia: a\.png"/);
  assert.match(foto, />Remover</);
  const video = pre({ fase: "pronto", nome: "v.mp4", tipo: "video", midiaId: "m", previa: "blob:http://x/2" });
  assert.match(video, /<video src="blob:http:\/\/x\/2" controls=""[^>]*aria-label="Prévia: v\.mp4"/);
  assert.doesNotMatch(video + foto, /midiaId|"m"/, "o id da mídia não vai para o HTML");
});
