/**
 * Textos da tela "Ativar Recuperar" (para revisão do Igor). Ficam fora do componente
 * para o teste cobrar o vocabulário: "número do atendimento", nunca "número da
 * recuperação", e nenhuma promessa de que o número não será restringido.
 */

export const BENEFICIOS: { titulo: string; texto: string }[] = [
  { titulo: "Pix pendente", texto: "Manda o código pronto pra copiar e lembra antes de vencer." },
  { titulo: "Carrinho abandonado", texto: "Pergunta o que travou e, depois, mostra depoimento de cliente de verdade." },
  {
    titulo: "Conversas com scripts",
    texto: "Quem responde cai num chat aqui dentro, com texto pronto pra frete, grade, pedido mínimo e troca.",
  },
  { titulo: "Número do atendimento", texto: "O Recuperar fala por um chip só dele. Seus grupos ficam no número deles." },
];

export const INCLUI: string[] = [
  "Inclui o número do atendimento, sem ocupar vaga de celular do seu plano",
  "Pix, carrinho e conversas no mesmo lugar",
  "Cancele quando quiser, sem multa",
];

export const RODAPE_DO_PRECO =
  "Precisa de: loja na Yampi e um chip de WhatsApp só pra isso. Se recuperar um pedido de R$ 500 no mês, o Recuperar já se pagou quase 4 vezes.";

export const PERGUNTAS: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "É seguro pro meu número?",
    resposta:
      "O Recuperar usa a mesma conexão não oficial dos seus grupos, e as regras do WhatsApp não permitem mensagem automática por esse tipo de conexão. Nenhum controle garante que um número não seja restringido. Por isso ele fala por um número só dele, separado do número dos grupos: se esse chip for restringido, seus grupos não são afetados. E manda devagar: intervalo sorteado, só em horário comercial, poucas mensagens por cliente, e pausa sozinho quando clientes reclamam.",
  },
  {
    pergunta: "Preciso deixar o celular do chip ligado?",
    resposta: "Não. O número fica conectado na Girumo. Só abra o WhatsApp no celular dele pelo menos uma vez a cada 14 dias.",
  },
  {
    pergunta: "E se eu não quiser mensagem automática?",
    resposta:
      "Deixe o automático desligado (ele já começa desligado). Os casos caem na fila de hoje e você manda pelo chat, com os scripts prontos.",
  },
  { pergunta: "Minha vendedora pode atender?", resposta: "Pode. Libere o Recuperar pra ela em Configurações › Equipe." },
  { pergunta: "Funciona com outra plataforma além da Yampi?", resposta: "Por enquanto, só com a Yampi." },
];
