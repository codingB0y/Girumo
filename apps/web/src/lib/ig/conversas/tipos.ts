import type { JanelaMeta } from "./situacao";
import type { MarcaDoFio } from "./fio";

/** Formato das rotas das Conversas, em português como o resto da API do Instagram. Nada daqui carrega o id do Instagram nem URL da Zernio. */

export type ConversaDto = {
  id: string;
  username: string | null;
  nome: string | null;
  situacao: "open" | "waiting" | "resolved";
  /** Pedido de mensagem (quem não segue a loja). */
  pedido: boolean;
  naoLidas: number;
  ultimaEm: string | null;
  ultimaDirecao: "in" | "out" | null;
  previa: string | null;
  /** Só quando a pausa ainda vale. */
  roboPausadoAte: string | null;
};

export type ListaDeConversas = {
  conversas: ConversaDto[];
  proximo: string | null;
  /** Conversas Aguardando você (contador da barra de cima). */
  aguardando: number;
  /** O filtro por etiqueta olhou só as pessoas mais recentes com ela (teto do filtro). */
  etiquetaParcial?: boolean;
};

export type AnexoDto = { indice: number; tipo: string; mime: string | null; nome: string | null };

export type MensagemDto = {
  id: string;
  direcao: "in" | "out";
  texto: string | null;
  criadaEm: string;
  /** Só nas nossas: Robô (com o run, para a tela achar o fluxo) ou Você; sem evento, sem rótulo. */
  autor: "robo" | "voce" | null;
  runId: string | null;
  anexos: AnexoDto[];
  respostaDeStory: boolean;
  mencaoEmStory: boolean;
  apagada: boolean;
};

export type FioDaConversa = {
  mensagens: MensagemDto[];
  proximo: string | null;
  marcas: MarcaDoFio[];
  janela: { estado: JanelaMeta; ultimaDelaEm: string | null };
  roboPausadoAte: string | null;
};
