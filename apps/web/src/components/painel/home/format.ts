export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// `getDateStr`/`getMonthStr` viviam aqui e fatiavam `toISOString()`, que é UTC:
// às 21h de Brasília o dia já tinha virado. Foram substituídos por
// `@/lib/date-br`, que é compartilhado com as métricas e o gráfico da semana —
// os três precisam concordar sobre que dia é hoje.
