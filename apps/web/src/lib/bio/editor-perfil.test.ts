// apps/web/src/lib/bio/editor-perfil.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  camposDaLista,
  cnpjDoCampo,
  focoDoCrop,
  instagramDoCampo,
  listaDosCampos,
  mascaraDoCnpj,
  problemaDaImagem,
  refDoCrop,
} from "./editor-perfil";

test("foto: só PNG, JPEG e WebP; até 10 MB na foto e 5 MB na logo, antes de gastar o envio", () => {
  assert.equal(problemaDaImagem({ type: "image/jpeg", size: 3_000_000 }, "lp-media"), null);
  assert.equal(problemaDaImagem({ type: "image/webp", size: 4_900_000 }, "lp-logo"), null);
  assert.equal(problemaDaImagem({ type: "image/gif", size: 1000 }, "lp-media"), "Envie a foto em PNG, JPEG ou WebP.");
  assert.equal(problemaDaImagem({ type: "image/heic", size: 1000 }, "lp-media"), "Envie a foto em PNG, JPEG ou WebP.");
  assert.equal(problemaDaImagem({ type: "image/jpeg", size: 10_000_001 }, "lp-media"), "Foto grande demais: o limite é 10 MB.");
  assert.equal(problemaDaImagem({ type: "image/png", size: 5_000_001 }, "lp-logo"), "Foto grande demais: o limite é 5 MB.");
});

test("CNPJ: o documento guarda 14 caracteres sem pontuação, em maiúsculas; a tela mostra a máscara conforme digita", () => {
  assert.equal(cnpjDoCampo("11.222.333/0001-81"), "11222333000181");
  assert.equal(cnpjDoCampo("11222333000181999"), "11222333000181");
  // O CNPJ com letras (Receita, desde julho de 2026): 12 [0-9A-Z] + 2 dígitos.
  assert.equal(cnpjDoCampo("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(mascaraDoCnpj("12ABC34501DE35"), "12.ABC.345/01DE-35");
  const passos: Array<[string, string]> = [
    ["", ""],
    ["1", "1"],
    ["11", "11"],
    ["112", "11.2"],
    ["11222", "11.222"],
    ["112223", "11.222.3"],
    ["11222333", "11.222.333"],
    ["112223330", "11.222.333/0"],
    ["112223330001", "11.222.333/0001"],
    ["1122233300018", "11.222.333/0001-8"],
    ["11222333000181", "11.222.333/0001-81"],
  ];
  for (const [cnpj, tela] of passos) assert.equal(mascaraDoCnpj(cnpj), tela, cnpj);
  // Apagar logo depois de um separador não prende o separador na tela.
  assert.equal(mascaraDoCnpj(cnpjDoCampo("11.")), "11");
});

test("@ do Instagram: tira o @ e o endereço colado, minúsculo, até 30 depois da limpeza", () => {
  assert.equal(instagramDoCampo("@Loja.Exemplo"), "loja.exemplo");
  assert.equal(instagramDoCampo("  atelie_exemplo  "), "atelie_exemplo");
  assert.equal(instagramDoCampo("https://www.instagram.com/loja.exemplo/?hl=pt-br"), "loja.exemplo");
  assert.equal(instagramDoCampo("instagram.com/loja.exemplo"), "loja.exemplo");
  assert.equal(instagramDoCampo("https://www.instagram.com/atelie.exemplo.kids.revenda.br/"), "atelie.exemplo.kids.revenda.br");
  assert.equal(instagramDoCampo("a".repeat(40)), "a".repeat(30));
  // Caractere que não vale fica: o painel avisa, não apaga o que a lojista digitou.
  assert.equal(instagramDoCampo("loja exemplo"), "loja exemplo");
});

test("destaques e linhas: campos fixos na tela; o documento só guarda os que têm texto, na ordem", () => {
  assert.deepEqual(camposDaLista(["a partir de R$ 19,90"], 3), ["a partir de R$ 19,90", "", ""]);
  assert.deepEqual(camposDaLista(["a", "b", "c", "d"], 3), ["a", "b", "c"]);
  assert.deepEqual(listaDosCampos(["", "envio pro Brasil", "  "]), ["envio pro Brasil"]);
  // Espaço no fim é de quem ainda está digitando: fica.
  assert.deepEqual(listaDosCampos(["a partir ", ""]), ["a partir "]);
});

test("foco da capa: ida e volta do CropFocal, em 0..1 com duas casas", () => {
  assert.deepEqual(refDoCrop({ id: "capa-falsa", foco: null }), { media_id: "capa-falsa", alt: "" });
  assert.deepEqual(refDoCrop({ id: "capa-falsa", foco: { x: 0.5, y: 0.3 } }), {
    media_id: "capa-falsa",
    alt: "",
    focal_x: 0.5,
    focal_y: 0.3,
  });
  assert.deepEqual(focoDoCrop({ media_id: "capa-falsa", alt: "", focal_x: 0.37123, focal_y: 1.4 }), { x: 0.37, y: 1 });
  assert.deepEqual(focoDoCrop({ media_id: "capa-falsa", alt: "" }), { x: 0.5, y: 0.5 });
});
