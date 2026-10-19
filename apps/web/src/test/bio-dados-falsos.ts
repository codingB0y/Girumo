/**
 * Página de link da bio de uma loja que NÃO existe, para testes e para a
 * conferência visual. O repositório é público: nada de foto, nome, CNPJ ou
 * telefone de cliente aqui. O CNPJ é o exemplo clássico (dígitos válidos).
 */
import type { DadosRender, DocumentoBio, LinkBio } from "@/lib/bio/documento";

export const IDS = {
  pagina: "0c8f6a2e-5b1d-4c3a-9e7f-1a2b3c4d5e6f",
  campanha: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6",
  whatsapp: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  catalogo: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  grupo: "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f",
  endereco: "d4e5f6a7-b8c9-4d0e-9f1a-3b4c5d6e7f80",
  canal: "e5f6a7b8-c9d0-4e1f-8a2b-4c5d6e7f8091",
} as const;

export const SLUG_DA_CAMPANHA = "vip-exemplo";

export function documentoFalso(): DocumentoBio {
  return {
    v: 1,
    modelo: "etiqueta",
    paleta: "azul",
    cores: null,
    animar: true,
    feitoComGirumo: true,
    perfil: {
      nome: "Ateliê Exemplo Kids",
      frase: "Kits de roupa infantil pra revender, do RN ao 14 anos.",
      destaques: ["a partir de R$ 19,90 a peça", "12 kits no catálogo", "envio pro Brasil inteiro"],
      local: "Loja na Rua Exemplo, 100, Centro, Cidade Exemplo",
      instagram: "atelie.exemplo",
      capa: { id: "capa-falsa", foco: { x: 0.5, y: 0.3 } },
      capaAlt: "Fachada da loja de exemplo",
      logoClara: { id: "logo-clara-falsa", foco: null },
      logoEscura: { id: "logo-escura-falsa", foco: null },
    },
    confere: {
      ativo: true,
      razao: "Ateliê Exemplo Comércio de Roupas Ltda",
      cnpj: "11222333000181",
      linhas: [
        "Na primeira compra, a gente mostra a loja por chamada de vídeo antes do Pix.",
        "Envio pro Brasil inteiro, com nota fiscal.",
      ],
    },
    rastreio: { metaPixelId: "", ga4Id: "" },
    links: [
      { id: IDS.whatsapp, tipo: "whatsapp", titulo: "Falar com a vendedora", sub: "Pedido, preço e estoque no WhatsApp", icone: "whatsapp", ativo: true, destaque: true, numero: "5562900000000", mensagem: "Oi! Vim pelo Instagram e quero ver os kits." },
      { id: IDS.catalogo, tipo: "link", titulo: "Catálogo de kits", sub: "Cada kit com vídeo, peças e preço", icone: "catalogo", ativo: true, destaque: false, url: "https://exemplo.com.br/catalogo", fotos: [{ id: "kit-1-falso", foco: null }, { id: "kit-2-falso", foco: { x: 0.375, y: 0.2 } }, { id: "kit-3-falso", foco: null }] },
      { id: IDS.grupo, tipo: "grupo", titulo: "Entrar no grupo VIP", sub: "Kit novo e reposição saem primeiro no grupo", icone: "coroa", ativo: true, destaque: false, campanhaId: IDS.campanha },
      { id: IDS.endereco, tipo: "endereco", titulo: "Como chegar na loja", sub: "Endereço, horário e o mapa", icone: "mapa", ativo: true, endereco: "Rua Exemplo, 100\nCentro, Cidade Exemplo", horario: "Seg a sex, das 8h às 17h", foto: { id: "fachada-falsa", foco: null } },
      { id: IDS.canal, tipo: "link", titulo: "Seguir o canal da loja", sub: "Novidades no seu WhatsApp", icone: "canal", ativo: true, destaque: false, url: "https://whatsapp.com/channel/EXEMPLO", fotos: [] },
    ],
  };
}

export function dadosFalsos(): DadosRender {
  return {
    documento: documentoFalso(),
    paginaId: IDS.pagina,
    campanhas: { [IDS.campanha]: SLUG_DA_CAMPANHA },
    linksEscondidos: [],
    origem: "https://www.girumo.com.br",
    dominioProprio: false,
  };
}

/** Texto com acento, cortado no tamanho pedido (o limite do campo no spec §4). */
function texto(n: number): string {
  return "Coleção de verão com peças à pronta-entrega e reposição toda semana ".repeat(4).slice(0, n);
}

/** A página no limite: 20 links com texto no máximo (um título sem espaço), 3 deles com 3 fotos. */
export function dadosCheios(): DadosRender {
  const d = dadosFalsos();
  const extras: LinkBio[] = Array.from({ length: 15 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    tipo: "link" as const,
    titulo: i === 2 ? "Promoçãorelâmpagodeverãocompeçasàpronta-entregajá!" : texto(50),
    sub: texto(80),
    icone: "sacola" as const,
    ativo: true,
    destaque: false,
    url: `https://exemplo.com.br/colecao/${String(i + 1).padStart(2, "0")}?utm_source=instagram&utm_medium=bio`,
    fotos: i < 2 ? [{ id: `foto-${i}-a`, foco: null }, { id: `foto-${i}-b`, foco: null }, { id: `foto-${i}-c`, foco: null }] : [],
  }));
  const base = d.documento.links.map((l) => ({ ...l, titulo: texto(50), sub: texto(80) }));
  return {
    ...d,
    documento: {
      ...d.documento,
      perfil: {
        ...d.documento.perfil,
        nome: texto(60),
        frase: texto(120),
        destaques: [texto(40), texto(40), texto(40)],
        local: texto(90),
        instagram: "atelie.exemplo.kids.revenda.br",
        capaAlt: texto(140),
      },
      confere: { ...d.documento.confere, razao: texto(120), linhas: [texto(160), texto(160)] },
      links: [...base, ...extras],
    },
  };
}
