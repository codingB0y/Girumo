import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/Igor/Desktop/HubFlow-platform/outputs/enem_ufg_med_30dias";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheets = {
  painel: workbook.worksheets.add("Painel"),
  metas: workbook.worksheets.add("Materias e Metas"),
  plano: workbook.worksheets.add("Plano 30 dias"),
  questoes: workbook.worksheets.add("Banco de Questoes"),
  simulados: workbook.worksheets.add("Simulados"),
  revisoes: workbook.worksheets.add("Revisoes"),
};

const colors = {
  navy: "#123047",
  teal: "#0F766E",
  green: "#166534",
  amber: "#B45309",
  red: "#B91C1C",
  paleBlue: "#EAF3F7",
  paleGreen: "#EAF7EF",
  paleAmber: "#FFF7E6",
  paleRed: "#FDECEC",
  gray: "#F4F6F8",
  border: "#D8DEE6",
  white: "#FFFFFF",
};

function title(sheet, range, text, subtitle = "") {
  sheet.getRange(range).merge();
  const r = sheet.getRange(range);
  r.values = [[text]];
  r.format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  r.format.rowHeightPx = 34;
  if (subtitle) {
    const start = range.split(":")[0].replace(/\d+$/, "");
    const end = range.split(":")[1].replace(/\d+$/, "");
    const row = Number(range.match(/\d+/)[0]) + 1;
    const sr = sheet.getRange(`${start}${row}:${end}${row}`);
    sr.merge();
    sr.values = [[subtitle]];
    sr.format = {
      fill: colors.paleBlue,
      font: { italic: true, color: "#334155" },
      horizontalAlignment: "center",
    };
  }
}

function header(range) {
  range.format = {
    fill: colors.teal,
    font: { bold: true, color: colors.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  range.format.borders = { preset: "outside", style: "thin", color: colors.border };
}

function section(range, fill = colors.gray) {
  range.format = { fill, font: { bold: true, color: "#172033" }, verticalAlignment: "center" };
}

function box(range, fill) {
  range.format = {
    fill,
    borders: { preset: "outside", style: "thin", color: colors.border },
    verticalAlignment: "center",
    wrapText: true,
  };
}

function setWidths(sheet, widths) {
  for (const [col, width] of Object.entries(widths)) {
    sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  }
}

for (const sheet of Object.values(sheets)) sheet.showGridLines = false;

const materias = [
  ["Biologia", "Ciencias da Natureza", 3, 0.1417, null, null, 6, "Ecologia, genetica, fisiologia, citologia", "Questao ENEM + erro classificado no mesmo dia"],
  ["Quimica", "Ciencias da Natureza", 3, 0.1250, null, null, 5, "Estequiometria, solucoes, organica, eletroquimica", "Lista curta, correcao ativa e formulas aplicadas"],
  ["Fisica", "Ciencias da Natureza", 3, 0.1083, null, null, 5, "Mecanica, energia, eletricidade, ondas", "Unidade, desenho da situacao e estimativa antes da conta"],
  ["Redacao", "Redacao", 2, 0.0000, null, null, 7, "Projeto de texto, repertorio e proposta", "2 redacoes por semana + reescrita dos piores parágrafos"],
  ["Linguagens", "Linguagens", 2, 0.2500, null, null, 8, "Interpretacao, literatura, gramatica por erro", "Leitura diaria e questoes por habilidade"],
  ["Matematica", "Matematica", 1.5, 0.1917, null, null, 7, "Funcoes, geometria, estatistica, porcentagem", "Resolver limpo, conferir unidade e registrar padrao de erro"],
  ["Humanas", "Ciencias Humanas", 1.5, 0.1833, null, null, 6, "Historia do Brasil, geografia, sociologia, filosofia", "Questoes ENEM com causa, consequencia e conceito"],
];

// Materias e metas
title(
  sheets.metas,
  "A1:I1",
  "Materias, pesos e metas",
  "A execucao e por materia. O peso da area fica automatico para priorizar sem confundir."
);
setWidths(sheets.metas, { A: 18, B: 24, C: 11, D: 13, E: 16, F: 16, G: 17, H: 42, I: 42 });
sheets.metas.getRange("A4:I4").values = [[
  "Materia",
  "Area ENEM",
  "Peso area",
  "% foco",
  "Questoes/dia",
  "Questoes/30 dias",
  "Horas/semana",
  "Prioridade",
  "Como estudar",
]];
header(sheets.metas.getRange("A4:I4"));
sheets.metas.getRange("A5:I11").values = materias;
sheets.metas.getRange("E5").formulas = [["=ROUND($B$15*D5,0)"]];
sheets.metas.getRange("E5:E11").fillDown();
sheets.metas.getRange("F5").formulas = [["=E5*$B$16"]];
sheets.metas.getRange("F5:F11").fillDown();
sheets.metas.getRange("A14:B19").values = [
  ["Premissa", "Valor"],
  ["Questoes objetivas por dia", 120],
  ["Dias por ciclo", 30],
  ["Simulados completos no ciclo", 4],
  ["Redacoes por semana", 2],
  ["Meses disponiveis", 3.5],
];
header(sheets.metas.getRange("A14:B14"));
box(sheets.metas.getRange("B15:B19"), colors.paleAmber);
sheets.metas.getRange("B15:B18").dataValidation = { rule: { type: "whole", operator: "between", formula1: 1, formula2: 400 } };
sheets.metas.getRange("D5:D11").format.numberFormat = "0.0%";
sheets.metas.getRange("C5:G11").format.numberFormat = "0.0";
sheets.metas.getRange("A5:I11").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
sheets.metas.getRange("A21:B25").values = [
  ["Regra do ciclo", "Todo dia tem questoes por materia. Toda questao errada vira revisao ou acao corretiva."],
  ["Prioridade 1", "Biologia, Quimica e Fisica aparecem separadas porque Natureza pesa 3,0 e decide Medicina."],
  ["Prioridade 2", "Redacao e Linguagens entram toda semana: elas sustentam nota alta e reduzem oscilacao."],
  ["Prioridade 3", "Matematica e Humanas mantem frequencia para nao perder pontos baratos."],
  ["Meta mental", "Nao conte questao feita; conte questao corrigida e erro entendido."],
];
for (let row = 21; row <= 25; row++) {
  sheets.metas.getRange(`B${row}:I${row}`).merge();
  sheets.metas.getRange(`A${row}:I${row}`).format.rowHeightPx = 36;
}
section(sheets.metas.getRange("A21:A25"), colors.paleBlue);
box(sheets.metas.getRange("B21:I25"), colors.white);

// Plano 30 dias
title(
  sheets.plano,
  "A1:N1",
  "Plano de 30 dias por materia",
  "Repita este ciclo 3 vezes; nas ultimas semanas, aumente simulados, redacao e revisao de erros."
);
setWidths(sheets.plano, { A: 7, B: 13, C: 28, D: 10, E: 10, F: 10, G: 12, H: 12, I: 10, J: 10, K: 14, L: 18, M: 22, N: 34 });
sheets.plano.getRange("A4:N4").values = [[
  "Dia", "Tipo", "Foco do dia", "Biologia", "Quimica", "Fisica", "Linguagens", "Matematica", "Humanas", "Redacao", "Total questoes", "Revisao", "Entrega", "Observacoes",
]];
header(sheets.plano.getRange("A4:N4"));
const focus = [
  [1, "Base", "Diagnostico por materia", 18, 16, 14, 28, 22, 22, 0, null, "Erros do dia", "Mapa de lacunas", "Medir nivel real em cada materia."],
  [2, "Lista", "Biologia + Linguagens", 28, 12, 8, 34, 18, 20, 0, null, "Erros D1-D2", "20 erros classificados", "Natureza separada para saber onde doi."],
  [3, "Lista", "Quimica + Matematica", 14, 28, 10, 24, 30, 14, 0, null, "Flashcards", "Lista corrigida", "Estequiometria, solucoes e porcentagem."],
  [4, "Lista", "Fisica + Humanas", 12, 12, 28, 22, 18, 28, 0, null, "Erros D3-D4", "Resumo de formulas", "Mecanica, energia, geografia fisica e Brasil."],
  [5, "Redacao", "Biologia + redacao", 30, 12, 8, 28, 18, 20, 1, null, "Reescrita parcial", "1 redacao", "Corrigir tese, repertorio, proposta e conectivos."],
  [6, "Lista", "Matematica aplicada", 16, 14, 10, 28, 34, 18, 0, null, "Erros da semana", "Top 10 erros", "Padrao de questao vale mais que teoria solta."],
  [7, "Simulado", "Simulado 90 questoes + analise", 12, 12, 10, 22, 18, 16, 0, null, "Correcao profunda", "Relatorio", "Cronometrar e classificar erros por materia."],
  [8, "Lista", "Biologia alta recorrencia", 36, 12, 10, 26, 18, 18, 0, null, "Erros D7-D8", "Caderno atualizado", "Ecologia, genetica, fisiologia e citologia."],
  [9, "Lista", "Quimica organica", 14, 34, 8, 34, 16, 14, 0, null, "Flashcards", "30 flashcards", "Questao, erro, regra e exemplo."],
  [10, "Redacao", "Fisica + redacao", 12, 12, 34, 24, 18, 16, 1, null, "Reescrita", "1 redacao", "Foco nas competencias 2, 3 e 5."],
  [11, "Lista", "Matematica: funcoes", 14, 14, 10, 26, 40, 16, 0, null, "Erros matematica", "Formulario enxuto", "Grafico, unidade e alternativa."],
  [12, "Lista", "Humanas forte", 12, 12, 10, 28, 18, 40, 0, null, "Erros humanas", "Linha do tempo", "Causa, consequencia e conceito."],
  [13, "Revisao", "Caderno de erros", 22, 20, 18, 26, 18, 16, 0, null, "Refazer erros", "80% dos erros refeitos", "Erro repetido vira prioridade do ciclo."],
  [14, "Simulado", "Simulado completo ou 2 blocos", 15, 15, 15, 45, 45, 45, 0, null, "Correcao por materia", "Acertos por materia", "Se nao der 180, faca 90 com correcao total."],
  [15, "Ajuste", "Nova rota + Natureza", 24, 22, 18, 24, 16, 16, 0, null, "Erros D14-D15", "Meta semanal", "Cortar tema confortavel demais."],
  [16, "Lista", "Biologia molecular", 36, 12, 8, 34, 16, 14, 0, null, "Flashcards", "Lista corrigida", "Leitura de enunciado longo."],
  [17, "Redacao", "Quimica fisico-quimica", 12, 34, 10, 24, 18, 18, 1, null, "Reescrita", "1 redacao", "Olhar projeto antes do texto final."],
  [18, "Lista", "Fisica: eletricidade", 12, 12, 36, 24, 20, 16, 0, null, "Erros fisica", "Formula + aplicacao", "Formula sem contexto nao resolve ENEM."],
  [19, "Lista", "Matematica: geometria", 14, 14, 10, 24, 42, 16, 0, null, "Erros matematica", "Lista corrigida", "Leia alternativas antes de calcular demais."],
  [20, "Lista", "Linguagens + Humanas", 10, 10, 8, 44, 16, 32, 0, null, "Erros D18-D20", "Mapa de temas", "Dia de resistencia de leitura."],
  [21, "Simulado", "Simulado por materia + redacao", 15, 15, 15, 45, 45, 45, 1, null, "Correcao profunda", "Redacao + acertos", "Treinar ordem real da prova."],
  [22, "Revisao", "Erros de Natureza", 30, 28, 24, 18, 10, 10, 0, null, "Refazer erros", "60 erros refeitos", "Aqui mora muito ponto de Medicina."],
  [23, "Lista", "Biologia + Quimica", 32, 30, 10, 24, 14, 10, 0, null, "Flashcards", "Lista corrigida", "Misturar conteudos reduz falsa seguranca."],
  [24, "Redacao", "Linguagens + redacao", 12, 10, 8, 46, 20, 20, 1, null, "Reescrita", "1 redacao", "Repertorio flexivel e proposta concreta."],
  [25, "Lista", "Fisica + Matematica", 10, 12, 32, 20, 36, 10, 0, null, "Erros exatas", "Top 15 erros", "Calculo limpo, unidade e estimativa."],
  [26, "Lista", "Humanas: socio/filo/geo", 10, 10, 8, 26, 18, 48, 0, null, "Erros humanas", "Mapa final", "Trabalho, poder, democracia e cultura."],
  [27, "Revisao", "Revisao geral por erros", 24, 22, 18, 24, 18, 14, 0, null, "Refazer erros", "80% de acerto", "So avance depois de corrigir motivos."],
  [28, "Simulado", "Simulado completo + estrategia", 15, 15, 15, 45, 45, 45, 1, null, "Correcao por peso", "Relatorio final", "Simule horario, comida e ordem real."],
  [29, "Ajuste", "3 piores materias", 24, 22, 18, 24, 18, 14, 0, null, "Erros D28-D29", "Plano proximo ciclo", "O proximo ciclo nasce dos dados."],
  [30, "Fechamento", "Revisao leve + redacao", 18, 16, 12, 30, 22, 18, 1, null, "Checklist final", "Metas recalibradas", "Comparar D1 com D30 e repetir melhor."],
];
sheets.plano.getRange("A5:N34").values = focus;
sheets.plano.getRange("K5").formulas = [["=SUM(D5:I5)"]];
sheets.plano.getRange("K5:K34").fillDown();
sheets.plano.getRange("D5:K34").format.numberFormat = "#,##0";
sheets.plano.getRange("A4:N34").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
sheets.plano.getRange("A4:N34").format.wrapText = true;
sheets.plano.freezePanes.freezeRows(4);
for (const [word, fill, color] of [["Simulado", colors.paleRed, colors.red], ["Redacao", colors.paleAmber, colors.amber], ["Revisao", colors.paleGreen, colors.green]]) {
  sheets.plano.getRange("B5:B34").conditionalFormats.add("containsText", { text: word, format: { fill, font: { bold: true, color } } });
}

// Abas individuais por materia
const materiaConfigs = {
  Biologia: {
    colIndex: 3,
    area: "Ciencias da Natureza",
    peso: 3,
    topics: [
      "Diagnostico: ecologia, genetica e fisiologia",
      "Ecologia: cadeias, ciclos e impactos ambientais",
      "Citologia: organelas, membrana e metabolismo celular",
      "Genetica: primeira lei, heredogramas e probabilidade",
      "Fisiologia humana: sistemas digestorio e circulatorio",
      "Botanica e fisiologia vegetal aplicada ao ENEM",
      "Revisao de erros de biologia do simulado",
      "Ecologia avancada: biomas, sucessao e energia",
      "Genetica molecular: DNA, RNA, sintese proteica",
      "Evolucao: selecao natural, especiacao e evidencias",
      "Microbiologia: virus, bacterias e saude publica",
      "Parasitologia e imunologia em questoes contextualizadas",
      "Refazer erros de biologia do ciclo",
      "Simulado: classificar erros de biologia",
      "Ajuste: tres topicos mais errados",
      "Biologia molecular e biotecnologia",
      "Ecologia + saude ambiental",
      "Fisiologia: respiratorio, excretor e nervoso",
      "Citologia + bioenergetica",
      "Botanica + ciclos reprodutivos",
      "Simulado: acertos e lacunas em biologia",
      "Caderno de erros: natureza com foco em biologia",
      "Biologia e quimica misturadas",
      "Questões de biologia com texto longo",
      "Genetica + evolucao",
      "Ecologia + impactos humanos",
      "Revisao geral por erros",
      "Simulado completo: biologia",
      "Ataque aos piores temas",
      "Revisao leve e checklist de biologia",
    ],
  },
  Quimica: {
    colIndex: 4,
    area: "Ciencias da Natureza",
    peso: 3,
    topics: [
      "Diagnostico: estequiometria, solucoes e organica",
      "Estequiometria: mol, massa e proporcao",
      "Solucoes: concentracao, diluicao e mistura",
      "Termoquimica e energia nas reacoes",
      "Quimica ambiental e separacao de misturas",
      "Ligacoes quimicas e polaridade",
      "Revisao de erros de quimica do simulado",
      "Funcoes inorganicas e reacoes",
      "Quimica organica: funcoes e nomenclatura",
      "Equilibrio quimico e deslocamento",
      "Eletroquimica: pilhas e eletrólise",
      "Cinética e fatores que alteram velocidade",
      "Refazer erros de quimica do ciclo",
      "Simulado: classificar erros de quimica",
      "Ajuste: topicos mais errados",
      "Quimica organica: isomeria e reacoes",
      "Fisico-quimica: pH, pOH e solucoes",
      "Radioatividade e aplicações",
      "Estequiometria contextualizada",
      "Quimica ambiental em questoes ENEM",
      "Simulado: acertos e lacunas em quimica",
      "Caderno de erros: natureza com foco em quimica",
      "Biologia e quimica misturadas",
      "Organica + interpretacao de texto",
      "Eletroquimica + energia",
      "Solucoes + graficos",
      "Revisao geral por erros",
      "Simulado completo: quimica",
      "Ataque aos piores temas",
      "Revisao leve e checklist de quimica",
    ],
  },
  Fisica: {
    colIndex: 5,
    area: "Ciencias da Natureza",
    peso: 3,
    topics: [
      "Diagnostico: mecanica, eletricidade e ondas",
      "Cinematica: graficos e movimento",
      "Dinamica: forcas, atrito e leis de Newton",
      "Energia, trabalho e potencia",
      "Hidrostatica e densidade",
      "Termologia: calorimetria e dilatacao",
      "Revisao de erros de fisica do simulado",
      "Ondulatoria: som, luz e fenomenos",
      "Eletricidade: corrente, resistencia e potencia",
      "Circuitos eletricos e associacao de resistores",
      "Optica geometrica",
      "Magnetismo e indução",
      "Refazer erros de fisica do ciclo",
      "Simulado: classificar erros de fisica",
      "Ajuste: topicos mais errados",
      "Eletricidade e consumo de energia",
      "Mecanica contextualizada",
      "Ondas e acustica",
      "Grafico, unidade e estimativa",
      "Termologia + maquinas termicas",
      "Simulado: acertos e lacunas em fisica",
      "Caderno de erros: natureza com foco em fisica",
      "Fisica com matematica aplicada",
      "Fisica em tecnologia e cotidiano",
      "Eletricidade + potencia",
      "Ondas + optica",
      "Revisao geral por erros",
      "Simulado completo: fisica",
      "Ataque aos piores temas",
      "Revisao leve e checklist de fisica",
    ],
  },
  Linguagens: {
    colIndex: 6,
    area: "Linguagens",
    peso: 2,
    topics: [
      "Diagnostico: interpretacao e habilidades ENEM",
      "Texto verbal: tese, inferencia e finalidade",
      "Generos textuais e funcao social",
      "Literatura: escolas por contexto historico",
      "Gramática a partir de erro real",
      "Artes, propaganda e linguagem visual",
      "Revisao de erros do simulado",
      "Interpretacao de textos longos",
      "Figuras de linguagem e efeitos de sentido",
      "Modernismo e literatura brasileira",
      "Variação linguistica",
      "Intertextualidade e parodia",
      "Refazer erros de linguagens",
      "Simulado: habilidades mais erradas",
      "Ajuste de rota em linguagens",
      "Leitura de enunciados densos",
      "Coesao, coerencia e conectivos",
      "Texto multimodal",
      "Literatura contemporanea",
      "Humanas + linguagens: resistencia de leitura",
      "Simulado: linguagens",
      "Revisao de erros de linguagens",
      "Linguagens em questoes mistas",
      "Linguagens + redacao",
      "Interpretacao com alternativas proximas",
      "Artes e cultura",
      "Revisao geral por erros",
      "Simulado completo: linguagens",
      "Ataque aos piores tipos de texto",
      "Revisao leve e leitura ativa",
    ],
  },
  Matematica: {
    colIndex: 7,
    area: "Matematica",
    peso: 1.5,
    topics: [
      "Diagnostico: aritmetica, graficos e geometria",
      "Porcentagem, razao e proporcao",
      "Regra de tres e escala",
      "Funcoes: leitura de grafico",
      "Estatistica: media, mediana e moda",
      "Geometria plana: area e perimetro",
      "Revisao de erros do simulado",
      "Matematica financeira simples",
      "Probabilidade",
      "PA, PG e padroes",
      "Funcoes afim e quadratica",
      "Geometria espacial",
      "Refazer erros de matematica",
      "Simulado: habilidades mais erradas",
      "Ajuste de rota em matematica",
      "Graficos e tabelas",
      "Porcentagem em contexto",
      "Trigonometria basica",
      "Geometria e estatistica",
      "Matematica + linguagens de grafico",
      "Simulado: matematica",
      "Revisao de erros de exatas",
      "Matematica em questoes mistas",
      "Matematica + redacao: leitura de dados",
      "Fisica + matematica aplicada",
      "Funcoes e estimativas",
      "Revisao geral por erros",
      "Simulado completo: matematica",
      "Ataque aos piores temas",
      "Revisao leve e formulario final",
    ],
  },
  Humanas: {
    colIndex: 8,
    area: "Ciencias Humanas",
    peso: 1.5,
    topics: [
      "Diagnostico: historia, geografia, socio e filo",
      "Historia do Brasil: colonia e imperio",
      "Geografia fisica: clima, relevo e biomas",
      "Mundo do trabalho e cidadania",
      "Cartografia e escalas",
      "Brasil republicano",
      "Revisao de erros do simulado",
      "Urbanizacao e industria",
      "Geopolitica e globalizacao",
      "Ditadura, redemocratizacao e constituicao",
      "Filosofia: etica e politica",
      "Sociologia: cultura, poder e sociedade",
      "Refazer erros de humanas",
      "Simulado: temas mais errados",
      "Ajuste de rota em humanas",
      "Geografia economica",
      "Movimentos sociais",
      "Conflitos, territorio e ambiente",
      "Historia geral em contexto",
      "Humanas + linguagens: leitura de texto",
      "Simulado: humanas",
      "Revisao de erros de humanas",
      "Humanas em questoes mistas",
      "Humanas + redacao: repertorio",
      "Atualidades estruturais",
      "Sociologia, filosofia e geografia",
      "Revisao geral por erros",
      "Simulado completo: humanas",
      "Ataque aos piores temas",
      "Revisao leve e mapa final",
    ],
  },
};

function createMateriaSheet(name, config) {
  const sheet = workbook.worksheets.add(name);
  sheets[name.toLowerCase()] = sheet;
  sheet.showGridLines = false;
  title(sheet, "A1:J1", `${name} - plano de 30 dias`, `Aba exclusiva de ${name}: estude por aqui e registre desempenho no banco geral.`);
  setWidths(sheet, { A: 7, B: 13, C: 13, D: 22, E: 42, F: 34, G: 16, H: 12, I: 12, J: 36 });
  sheet.getRange("A4:J4").values = [[
    "Dia", "Tipo", "Questoes", "Foco do dia", "Topico da materia", "Como executar", "Status", "Acertos", "Erros", "Observacao",
  ]];
  header(sheet.getRange("A4:J4"));
  const rows = focus.map((row, idx) => {
    const count = row[config.colIndex];
    return [
      row[0],
      row[1],
      count,
      row[2],
      config.topics[idx],
      count > 0
        ? `Fazer ${count} questoes, corrigir todas e registrar erros por topico.`
        : "Dia sem lista objetiva desta materia; usar para leitura, repertorio ou revisao curta.",
      null,
      null,
      null,
      null,
    ];
  });
  sheet.getRange("A5:J34").values = rows;
  sheet.getRange("G5:G34").dataValidation = { rule: { type: "list", values: ["Nao iniciado", "Fazendo", "Corrigido", "Revisar", "Dominado"] } };
  sheet.getRange("H5:I34").dataValidation = { rule: { type: "whole", operator: "between", formula1: 0, formula2: 200 } };
  sheet.getRange("A4:J34").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
  sheet.getRange("A4:J34").format.wrapText = true;
  sheet.getRange("C5:C34").format.numberFormat = "#,##0";
  sheet.getRange("H5:I34").format.numberFormat = "#,##0";
  sheet.getRange("A37:J37").merge();
  sheet.getRange("A37:J37").values = [[`Area ENEM: ${config.area} | Peso aplicado: ${config.peso}. Registre blocos detalhados na aba Banco de Questoes.`]];
  section(sheet.getRange("A37:J37"), colors.paleBlue);
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

for (const [name, config] of Object.entries(materiaConfigs)) {
  createMateriaSheet(name, config);
}

const redacaoSheet = workbook.worksheets.add("Redacao");
sheets.redacao = redacaoSheet;
redacaoSheet.showGridLines = false;
title(redacaoSheet, "A1:J1", "Redacao - plano de 30 dias", "Aba exclusiva de redacao: producao, repertorio, competencias e reescrita.");
setWidths(redacaoSheet, { A: 7, B: 15, C: 22, D: 30, E: 28, F: 20, G: 16, H: 14, I: 14, J: 38 });
redacaoSheet.getRange("A4:J4").values = [[
  "Dia", "Tipo", "Tarefa", "Tema/treino", "Competencia foco", "Entrega", "Status", "Nota", "Reescrita?", "Observacao",
]];
header(redacaoSheet.getRange("A4:J4"));
const redacaoTasks = focus.map((row) => {
  const hasEssay = row[9] === 1;
  return [
    row[0],
    row[1],
    hasEssay ? "Redacao completa" : row[1] === "Revisao" ? "Revisao de redacao anterior" : "Treino curto",
    hasEssay ? "Tema ENEM cronometrado" : "Repertorio, projeto de texto ou paragrafo especifico",
    hasEssay ? "Competencias 2, 3 e 5" : "Competencia mais fraca da ultima correcao",
    hasEssay ? "1 redacao + correcao" : "15-30 min de treino",
    null,
    null,
    null,
    null,
  ];
});
redacaoSheet.getRange("A5:J34").values = redacaoTasks;
redacaoSheet.getRange("G5:G34").dataValidation = { rule: { type: "list", values: ["Nao iniciado", "Fazendo", "Corrigido", "Revisar", "Dominado"] } };
redacaoSheet.getRange("I5:I34").dataValidation = { rule: { type: "list", values: ["Sim", "Nao", "Parcial"] } };
redacaoSheet.getRange("H5:H34").dataValidation = { rule: { type: "whole", operator: "between", formula1: 0, formula2: 1000 } };
redacaoSheet.getRange("A4:J34").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
redacaoSheet.getRange("A4:J34").format.wrapText = true;
redacaoSheet.freezePanes.freezeRows(4);

// Banco de questoes
title(sheets.questoes, "A1:N1", "Banco de questoes por materia", "Escolha a materia direto. Area e peso sao calculados automaticamente.");
setWidths(sheets.questoes, { A: 12, B: 11, C: 18, D: 22, E: 24, F: 14, G: 12, H: 12, I: 13, J: 10, K: 14, L: 16, M: 22, N: 36 });
sheets.questoes.getRange("A4:N4").values = [[
  "Data", "Dia ciclo", "Materia", "Area auto", "Topico", "Fonte", "Questoes", "Acertos", "% acerto", "Peso", "Pontos", "Status", "Tipo de erro", "Acao corretiva",
]];
header(sheets.questoes.getRange("A4:N4"));
sheets.questoes.getRange("A5:N204").values = Array.from({ length: 200 }, () => [null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
sheets.questoes.getRange("D5").formulas = [["=IF(C5=\"\",\"\",IF(OR(C5=\"Biologia\",C5=\"Quimica\",C5=\"Fisica\"),\"Ciencias da Natureza\",IF(C5=\"Humanas\",\"Ciencias Humanas\",C5)))"]];
sheets.questoes.getRange("D5:D204").fillDown();
sheets.questoes.getRange("I5").formulas = [["=IF(G5=0,\"\",H5/G5)"]];
sheets.questoes.getRange("I5:I204").fillDown();
sheets.questoes.getRange("J5").formulas = [["=IF(C5=\"\",\"\",IF(OR(C5=\"Biologia\",C5=\"Quimica\",C5=\"Fisica\"),3,IF(OR(C5=\"Redacao\",C5=\"Linguagens\"),2,1.5)))"]];
sheets.questoes.getRange("J5:J204").fillDown();
sheets.questoes.getRange("K5").formulas = [["=IF(OR(G5=0,J5=\"\"),\"\",H5*J5)"]];
sheets.questoes.getRange("K5:K204").fillDown();
sheets.questoes.getRange("C5:C204").dataValidation = { rule: { type: "list", values: ["Biologia", "Quimica", "Fisica", "Redacao", "Linguagens", "Matematica", "Humanas"] } };
sheets.questoes.getRange("L5:L204").dataValidation = { rule: { type: "list", values: ["Nao iniciado", "Fazendo", "Corrigido", "Revisar", "Dominado"] } };
sheets.questoes.getRange("M5:M204").dataValidation = { rule: { type: "list", values: ["Conteudo", "Interpretacao", "Calculo", "Tempo", "Distracao", "Chute", "Redacao - competencia"] } };
sheets.questoes.getRange("A5:A204").format.numberFormat = "yyyy-mm-dd";
sheets.questoes.getRange("G5:H204").format.numberFormat = "#,##0";
sheets.questoes.getRange("I5:I204").format.numberFormat = "0.0%";
sheets.questoes.getRange("J5:K204").format.numberFormat = "0.0";
sheets.questoes.getRange("A4:N204").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
sheets.questoes.getRange("I5:I204").conditionalFormats.add("cellIs", { operator: "lessThan", formula: 0.6, format: { fill: colors.paleRed, font: { color: colors.red, bold: true } } });
sheets.questoes.getRange("I5:I204").conditionalFormats.add("cellIs", { operator: "greaterThanOrEqual", formula: 0.8, format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } } });
sheets.questoes.freezePanes.freezeRows(4);

// Simulados
title(sheets.simulados, "A1:Q1", "Controle de simulados por materia", "Registre Natureza separada em Biologia, Quimica e Fisica.");
setWidths(sheets.simulados, { A: 12, B: 18, C: 11, D: 11, E: 10, F: 12, G: 12, H: 10, I: 10, J: 12, K: 12, L: 14, M: 14, N: 16, O: 16, P: 20, Q: 36 });
sheets.simulados.getRange("A4:Q4").values = [[
  "Data", "Simulado", "Biologia", "Quimica", "Fisica", "Linguagens", "Matematica", "Humanas", "Redacao", "Natureza", "Total obj.", "% obj.", "Pond. obj.", "Pond. total", "Tempo prova", "Prioridade", "Decisao para semana",
]];
header(sheets.simulados.getRange("A4:Q4"));
sheets.simulados.getRange("A5:Q8").values = [
  [null, "Diagnostico D7", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [null, "Simulado D14", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [null, "Simulado D21", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [null, "Simulado D28", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
];
sheets.simulados.getRange("J5").formulas = [["=SUM(C5:E5)"]];
sheets.simulados.getRange("J5:J8").fillDown();
sheets.simulados.getRange("K5").formulas = [["=SUM(C5:H5)"]];
sheets.simulados.getRange("K5:K8").fillDown();
sheets.simulados.getRange("L5").formulas = [["=IF(K5=0,\"\",K5/180)"]];
sheets.simulados.getRange("L5:L8").fillDown();
sheets.simulados.getRange("M5").formulas = [["=(C5+D5+E5)*3+F5*2+G5*1.5+H5*1.5"]];
sheets.simulados.getRange("M5:M8").fillDown();
sheets.simulados.getRange("N5").formulas = [["=M5+IF(I5=\"\",\"\",I5*2/100)"]];
sheets.simulados.getRange("N5:N8").fillDown();
sheets.simulados.getRange("P5").formulas = [["=IF(K5=0,\"\",IF(MIN(C5:H5)=C5,\"Biologia\",IF(MIN(C5:H5)=D5,\"Quimica\",IF(MIN(C5:H5)=E5,\"Fisica\",IF(MIN(C5:H5)=F5,\"Linguagens\",IF(MIN(C5:H5)=G5,\"Matematica\",\"Humanas\"))))))"]];
sheets.simulados.getRange("P5:P8").fillDown();
sheets.simulados.getRange("A5:A8").format.numberFormat = "yyyy-mm-dd";
sheets.simulados.getRange("C5:K8").format.numberFormat = "#,##0";
sheets.simulados.getRange("L5:L8").format.numberFormat = "0.0%";
sheets.simulados.getRange("M5:N8").format.numberFormat = "0.0";
sheets.simulados.getRange("A4:Q8").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };

// Revisoes
title(sheets.revisoes, "A1:J1", "Revisoes e caderno de erros por materia", "Todo erro importante ganha data de revisao.");
setWidths(sheets.revisoes, { A: 12, B: 18, C: 22, D: 26, E: 18, F: 10, G: 12, H: 18, I: 18, J: 42 });
sheets.revisoes.getRange("A4:J4").values = [[
  "Data erro", "Materia", "Area auto", "Topico", "Tipo de erro", "Peso", "Revisar em", "Status", "Acertou depois?", "Resumo do aprendizado",
]];
header(sheets.revisoes.getRange("A4:J4"));
sheets.revisoes.getRange("A5:J164").values = Array.from({ length: 160 }, () => [null, null, null, null, null, null, null, null, null, null]);
sheets.revisoes.getRange("C5").formulas = [["=IF(B5=\"\",\"\",IF(OR(B5=\"Biologia\",B5=\"Quimica\",B5=\"Fisica\"),\"Ciencias da Natureza\",IF(B5=\"Humanas\",\"Ciencias Humanas\",B5)))"]];
sheets.revisoes.getRange("C5:C164").fillDown();
sheets.revisoes.getRange("F5").formulas = [["=IF(B5=\"\",\"\",IF(OR(B5=\"Biologia\",B5=\"Quimica\",B5=\"Fisica\"),3,IF(OR(B5=\"Redacao\",B5=\"Linguagens\"),2,1.5)))"]];
sheets.revisoes.getRange("F5:F164").fillDown();
sheets.revisoes.getRange("G5").formulas = [["=IF(A5=\"\",\"\",A5+IF(F5>=2,2,3))"]];
sheets.revisoes.getRange("G5:G164").fillDown();
sheets.revisoes.getRange("B5:B164").dataValidation = { rule: { type: "list", values: ["Biologia", "Quimica", "Fisica", "Redacao", "Linguagens", "Matematica", "Humanas"] } };
sheets.revisoes.getRange("H5:H164").dataValidation = { rule: { type: "list", values: ["Pendente", "Feita", "Revisar de novo", "Dominado"] } };
sheets.revisoes.getRange("I5:I164").dataValidation = { rule: { type: "list", values: ["Sim", "Nao", "Parcial"] } };
sheets.revisoes.getRange("A5:A164").format.numberFormat = "yyyy-mm-dd";
sheets.revisoes.getRange("G5:G164").format.numberFormat = "yyyy-mm-dd";
sheets.revisoes.getRange("A4:J164").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
sheets.revisoes.freezePanes.freezeRows(4);

// Painel
title(sheets.painel, "A1:K1", "Medicina UFG - Plano ENEM por materia", "Acompanhamento do ciclo de 30 dias, focado em questoes, redacao e erros.");
setWidths(sheets.painel, { A: 20, B: 16, C: 16, D: 16, E: 3, F: 18, G: 16, H: 16, I: 16, J: 16, K: 20 });
sheets.painel.getRange("A4:D4").values = [["Indicador", "Meta", "Realizado", "Progresso"]];
header(sheets.painel.getRange("A4:D4"));
sheets.painel.getRange("A5:D10").values = [
  ["Questoes no ciclo", null, null, null],
  ["Redacoes no ciclo", null, null, null],
  ["Simulados feitos", null, null, null],
  ["Acerto medio", null, null, null],
  ["Pontos ponderados", null, null, null],
  ["Revisoes pendentes", null, null, null],
];
sheets.painel.getRange("B5").formulas = [["='Materias e Metas'!B15*'Materias e Metas'!B16"]];
sheets.painel.getRange("B6").formulas = [["=ROUND('Materias e Metas'!B18*('Materias e Metas'!B16/7),0)"]];
sheets.painel.getRange("B7").formulas = [["='Materias e Metas'!B17"]];
sheets.painel.getRange("B8").values = [[0.75]];
sheets.painel.getRange("B9").formulas = [["=B5*2.2"]];
sheets.painel.getRange("B10").values = [[0]];
sheets.painel.getRange("C5").formulas = [["=SUM('Banco de Questoes'!G5:G204)"]];
sheets.painel.getRange("C6").formulas = [["=COUNTIF('Banco de Questoes'!C5:C204,\"Redacao\")"]];
sheets.painel.getRange("C7").formulas = [["=COUNTA('Simulados'!A5:A8)"]];
sheets.painel.getRange("C8").formulas = [["=IF(SUM('Banco de Questoes'!G5:G204)=0,\"\",SUM('Banco de Questoes'!H5:H204)/SUM('Banco de Questoes'!G5:G204))"]];
sheets.painel.getRange("C9").formulas = [["=SUM('Banco de Questoes'!K5:K204)"]];
sheets.painel.getRange("C10").formulas = [["=COUNTIFS('Revisoes'!H5:H164,\"Pendente\",'Revisoes'!A5:A164,\"<>\")"]];
sheets.painel.getRange("D5").formulas = [["=IF(B5=0,\"\",C5/B5)"]];
sheets.painel.getRange("D5:D10").fillDown();
sheets.painel.getRange("B8:C8").format.numberFormat = "0.0%";
sheets.painel.getRange("D5:D10").format.numberFormat = "0.0%";
sheets.painel.getRange("B5:C10").format.numberFormat = "#,##0.0";
sheets.painel.getRange("A5:D10").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
sheets.painel.getRange("A13:D13").values = [["Materia", "Peso", "Meta 30d", "% Foco"]];
header(sheets.painel.getRange("A13:D13"));
sheets.painel.getRange("A14:D20").formulas = [
  ["='Materias e Metas'!A5", "='Materias e Metas'!C5", "='Materias e Metas'!F5", "='Materias e Metas'!D5"],
  ["='Materias e Metas'!A6", "='Materias e Metas'!C6", "='Materias e Metas'!F6", "='Materias e Metas'!D6"],
  ["='Materias e Metas'!A7", "='Materias e Metas'!C7", "='Materias e Metas'!F7", "='Materias e Metas'!D7"],
  ["='Materias e Metas'!A8", "='Materias e Metas'!C8", "='Materias e Metas'!F8", "='Materias e Metas'!D8"],
  ["='Materias e Metas'!A9", "='Materias e Metas'!C9", "='Materias e Metas'!F9", "='Materias e Metas'!D9"],
  ["='Materias e Metas'!A10", "='Materias e Metas'!C10", "='Materias e Metas'!F10", "='Materias e Metas'!D10"],
  ["='Materias e Metas'!A11", "='Materias e Metas'!C11", "='Materias e Metas'!F11", "='Materias e Metas'!D11"],
];
sheets.painel.getRange("D14:D20").format.numberFormat = "0.0%";
sheets.painel.getRange("B14:C20").format.numberFormat = "0.0";
sheets.painel.getRange("A13:D20").format.borders = { preset: "insideHorizontal", style: "thin", color: colors.border };
const chart = sheets.painel.charts.add("bar", sheets.painel.getRange("A13:C20"));
chart.title = "Meta por materia";
chart.hasLegend = true;
chart.setPosition("F4", "K20");
sheets.painel.getRange("A23:K27").values = [
  ["Como usar este arquivo", "", "", "", "", "", "", "", "", "", ""],
  ["1. No Plano 30 dias, faca as questoes indicadas em Biologia, Quimica, Fisica e demais materias.", "", "", "", "", "", "", "", "", "", ""],
  ["2. No Banco de Questoes, registre a materia diretamente; area e peso aparecem automaticamente.", "", "", "", "", "", "", "", "", "", ""],
  ["3. Nos simulados, separe Natureza em Biologia, Quimica e Fisica para saber onde atacar.", "", "", "", "", "", "", "", "", "", ""],
  ["4. Repita o ciclo por 3 meses; nas ultimas 2 semanas, reduza teoria e aumente revisao de erro + simulados.", "", "", "", "", "", "", "", "", "", ""],
];
for (let row = 23; row <= 27; row++) sheets.painel.getRange(`A${row}:K${row}`).merge();
section(sheets.painel.getRange("A23:K23"), colors.paleGreen);
box(sheets.painel.getRange("A24:K27"), colors.white);

for (const sheet of Object.values(sheets)) {
  const used = sheet.getUsedRange();
  used.format.font = { name: "Aptos", size: 10 };
  used.format.verticalAlignment = "center";
}

for (const [sheetName, range] of [
  ["Painel", "A1:K1"],
  ["Materias e Metas", "A1:I1"],
  ["Plano 30 dias", "A1:N1"],
  ["Banco de Questoes", "A1:N1"],
  ["Simulados", "A1:Q1"],
  ["Revisoes", "A1:J1"],
]) {
  const r = workbook.worksheets.getItem(sheetName).getRange(range);
  r.format.font = { name: "Aptos Display", size: 16, bold: true, color: colors.white };
}

const previewNames = [];
const runStamp = Date.now();
for (const sheetName of Object.keys(sheets).map(k => sheets[k].name)) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const file = path.join(outputDir, `${sheetName.replaceAll(" ", "_")}_${runStamp}.png`);
  await fs.writeFile(file, new Uint8Array(await preview.arrayBuffer()));
  previewNames.push(file);
}

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "formula_error_scan.ndjson"), formulaErrors.ndjson ?? "");

const painelCheck = await workbook.inspect({
  kind: "table",
  range: "Painel!A4:D10",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 6,
});
await fs.writeFile(path.join(outputDir, "painel_check.ndjson"), painelCheck.ndjson ?? "");

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "Plano_ENEM_Medicina_UFG_30_dias.xlsx"));

console.log(JSON.stringify({
  output: path.join(outputDir, "Plano_ENEM_Medicina_UFG_30_dias.xlsx"),
  previews: previewNames,
}, null, 2));
