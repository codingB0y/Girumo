import assert from "node:assert/strict";
import {
  BOARD_AREAS,
  BOARD_PRIORITIES,
  BOARD_STATUSES,
  FEITO_STATUSES,
  STATUS_HINTS,
  STATUS_LABELS,
  VERIFICATION_STALE_DAYS,
  WIP_LIMIT_EM_CONSTRUCAO,
  groupByStatus,
  isBoardArea,
  isBoardPriority,
  isBoardStatus,
  isVerificationStale,
  wipState,
  type BoardFeature,
} from "./status";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-08-12T00:00:00.000Z");
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString();

function feature(partial: Partial<BoardFeature> = {}): BoardFeature {
  return {
    id: "id-1",
    key: "k",
    title: "T",
    area: "Infra",
    status: "nao_existe",
    summary: null,
    blocker: null,
    evidence: null,
    evidenceAt: null,
    priority: "media",
    sortOrder: 0,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(90),
    ...partial,
  };
}

// Não existe coluna "Feito": o vocabulário é o ponto do quadro.
assert.equal(BOARD_STATUSES.length, 5);
assert.ok(!BOARD_STATUSES.includes("feito" as never), "sem coluna Feito");
// O par verificado × não-verificado é o que mais se lê no quadro: os rótulos não podem
// diferir só por uma negação, senão as duas colunas viram a mesma no cabeçalho.
{
  const semProva = STATUS_LABELS.no_ar_nao_verificado.toLowerCase();
  const comProva = STATUS_LABELS.no_ar_verificado.toLowerCase();
  const negacoes = ["não ", "nao ", "(não", "(nao"];

  assert.ok(
    !negacoes.some((n) => semProva.includes(n) && semProva.replace(n, "").trim() === comProva),
    "rótulos diferem só por negação",
  );
  assert.ok(
    !comProva.split(/\s+/).every((palavra) => semProva.includes(palavra)),
    "rótulo verificado está contido no não-verificado",
  );
}

// A cinta "Feito" cobre colunas contíguas. O trilho é montado por slice em torno dela:
// reordenar BOARD_STATUSES sem ajustar a cinta some com uma coluna, e a tela não reclama.
{
  const indices = FEITO_STATUSES.map((s) => BOARD_STATUSES.indexOf(s));
  assert.ok(indices.every((i) => i >= 0), "cinta aponta para status inexistente");
  assert.ok(
    indices.every((valor, i) => i === 0 || valor === indices[i - 1] + 1),
    "cinta Feito não é contígua",
  );

  const primeiro = indices[0];
  assert.deepEqual(
    [
      ...BOARD_STATUSES.slice(0, primeiro),
      ...FEITO_STATUSES,
      ...BOARD_STATUSES.slice(primeiro + FEITO_STATUSES.length),
    ],
    [...BOARD_STATUSES],
    "trilho perdeu ou duplicou coluna",
  );

  // A cinta é o "feito" do quadro — não pode virar coluna própria, nem cobrir o quadro todo.
  assert.ok(FEITO_STATUSES.length < BOARD_STATUSES.length, "cinta cobre o quadro inteiro");
}

// Verificação vence depois de 30 dias.
{
  const fresco = feature({ status: "no_ar_verificado", evidence: "PR #1", evidenceAt: daysAgo(29) });
  const vencido = feature({ status: "no_ar_verificado", evidence: "PR #1", evidenceAt: daysAgo(31) });
  assert.equal(isVerificationStale(fresco, now), false);
  assert.equal(isVerificationStale(vencido, now), true);
  assert.equal(VERIFICATION_STALE_DAYS, 30);
}

// Exatamente 30 dias ainda não venceu — a borda é ">", não ">=".
assert.equal(
  isVerificationStale(feature({ status: "no_ar_verificado", evidenceAt: daysAgo(30) }), now),
  false,
);

// Só card verificado vence. Um "no ar não verificado" antigo não ganha selo:
// ele já está na coluna que diz a verdade.
assert.equal(
  isVerificationStale(feature({ status: "no_ar_nao_verificado", evidenceAt: daysAgo(365) }), now),
  false,
);

// Verificado sem data não vence (o banco impede o caso; a UI não deve quebrar).
assert.equal(
  isVerificationStale(feature({ status: "no_ar_verificado", evidenceAt: null }), now),
  false,
);

// WIP: abaixo do teto, no teto, acima do teto.
assert.equal(WIP_LIMIT_EM_CONSTRUCAO, 3);
assert.equal(wipState(2, 3), "ok");
assert.equal(wipState(3, 3), "cheio");
assert.equal(wipState(4, 3), "estourado");
assert.equal(wipState(0, 3), "ok");

// Agrupamento devolve as 5 chaves, mesmo vazias — a coluna existe sem card.
{
  const grupos = groupByStatus([
    feature({ id: "a", key: "a", status: "quebrado" }),
    feature({ id: "b", key: "b", status: "quebrado" }),
  ]);
  assert.equal(Object.keys(grupos).length, 5);
  assert.equal(grupos.quebrado.length, 2);
  assert.equal(grupos.nao_existe.length, 0);
}

// Ordenação dentro da coluna: sort_order primeiro, depois título.
{
  const grupos = groupByStatus([
    feature({ id: "2", key: "z", title: "Zebra", status: "em_construcao", sortOrder: 0 }),
    feature({ id: "1", key: "a", title: "Alfa", status: "em_construcao", sortOrder: 0 }),
    feature({ id: "0", key: "p", title: "Prioritario", status: "em_construcao", sortOrder: -1 }),
  ]);
  assert.deepEqual(grupos.em_construcao.map((f) => f.title), ["Prioritario", "Alfa", "Zebra"]);
}

// Os guards existem para o texto que vem do banco e da rede não entrar na marra.
// Antes deles, um status desconhecido fazia o card sumir de todas as colunas em silêncio.
for (const status of BOARD_STATUSES) {
  assert.equal(isBoardStatus(status), true, `${status} deveria ser status válido`);
}
for (const priority of BOARD_PRIORITIES) {
  assert.equal(isBoardPriority(priority), true, `${priority} deveria ser prioridade válida`);
}
for (const area of BOARD_AREAS) {
  assert.equal(isBoardArea(area), true, `${area} deveria ser área válida`);
}

// Recusa o que não pertence, incluindo os tipos errados que chegam de JSON.
assert.equal(isBoardStatus("feito"), false, "não existe coluna Feito");
assert.equal(isBoardStatus("NAO_EXISTE"), false, "case importa");
assert.equal(isBoardStatus(undefined), false);
assert.equal(isBoardStatus(null), false);
assert.equal(isBoardStatus(3), false);
assert.equal(isBoardPriority("urgentissima"), false);
assert.equal(isBoardArea("Foo"), false, "área fora da lista viraria opção nova no filtro");

// Todos os cinco rótulos existem e nenhum é vazio — a coluna precisa de nome na tela.
// Idem para a linha de definição: cabeçalho meio preenchido fica pior que sem nenhuma.
for (const status of BOARD_STATUSES) {
  assert.ok(STATUS_LABELS[status]?.trim(), `${status} sem rótulo`);
  assert.ok(STATUS_HINTS[status]?.trim(), `${status} sem linha de definição`);
}
