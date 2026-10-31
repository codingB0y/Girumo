// infra/scripts/fase0-recuperar/ligacao.mjs
// Go/no-go do automático: dá para ligar a resposta de uma cliente ao telefone para o qual escrevemos?
// Lê o bruto e imprime só classificações (nenhum telefone, JID ou texto).
//   node infra/scripts/fase0-recuperar/ligacao.mjs
import { pathToFileURL } from "node:url";
import { celulares, dirBruto, eventosDaRota, lerEstado } from "./comum.mjs";

const ultimos8 = (s) => String(s ?? "").replace(/\D/g, "").slice(-8); // ignora o 55 e o 9º dígito
const telefoneDoJid = (jid) => /^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(jid ?? "")?.[1] ?? null;
const segundos = (de, ate) => (Date.parse(ate) - Date.parse(de)) / 1000;

/**
 * Cada resposta 1:1 recebida cai numa destas ligações:
 *   telefone_direto            remoteJid já vem como telefone (a Evolution troca o @lid pelo remoteJidAlt quando ele existe)
 *   lid_com_telefone_ao_lado   remoteJid em @lid e o telefone vem em remoteJidAlt/senderPn
 *   lid_aprendido_no_update    @lid igual ao remoteJid do messages.update de uma mensagem nossa (casa pelo key.id)
 *   lid_aprendido_no_envio     @lid igual ao key.remoteJid devolvido pelo envio
 *   lid_orfao                  nenhuma das anteriores: sem ligação determinística
 */
export function classificar({ eventos, enviados, celulares: fones }) {
  const alvos = Object.entries(fones).filter(([rotulo]) => rotulo !== "CHIP");
  const rotuloDe = (telefone) => (telefone ? (alvos.find(([, n]) => ultimos8(n) === ultimos8(telefone))?.[0] ?? null) : null);
  const todos = eventos.map((e) => ({ seq: e.seq, chegada: e.chegada, evento: e.body?.event, d: e.body?.data }));
  const atualizacoes = todos.filter((x) => x.evento === "messages.update" && x.d);
  const idsEnviados = new Set(enviados.map((e) => e.keyId));
  const primeiroEnvio = enviados.map((e) => e.em).sort()[0] ?? null;
  // grupo, status e canal nunca são resposta a envio nosso
  const upserts = todos.filter((x) => x.evento === "messages.upsert" && x.d?.key && !/@(g\.us|broadcast|newsletter)$/.test(String(x.d.key.remoteJid)));

  const linhas = upserts
    .filter((x) => !x.d.key.fromMe)
    .map(({ seq, chegada, d }) => {
      const { remoteJid: jid, remoteJidAlt, senderPn, addressingMode } = d.key;
      const alt = remoteJidAlt ?? senderPn ?? null;
      // o que vem "ao lado": o LID (caso B do plano 4), o telefone (a Evolution trocou o remoteJid por ele) ou nada
      const altTipo = !alt ? "-" : String(alt).endsWith("@lid") ? "lid" : String(alt).endsWith("@s.whatsapp.net") ? "telefone" : "outro";
      let via;
      let rotulo = rotuloDe(telefoneDoJid(jid));
      let ackAntes = null;
      if (rotulo) via = "telefone_direto";
      else if (String(jid).endsWith("@lid")) {
        rotulo = rotuloDe(telefoneDoJid(alt));
        if (rotulo) via = "lid_com_telefone_ao_lado";
        else {
          const upd = atualizacoes.find((u) => u.d.remoteJid === jid && idsEnviados.has(u.d.keyId));
          const envio = enviados.find((e) => e.jid === jid);
          if (upd) {
            rotulo = enviados.find((e) => e.keyId === upd.d.keyId).para;
            via = "lid_aprendido_no_update";
            ackAntes = upd.chegada <= chegada;
          } else if (envio) {
            rotulo = envio.para;
            via = "lid_aprendido_no_envio";
          } else via = "lid_orfao";
        }
      } else if (telefoneDoJid(jid)) via = "de_fora"; // telefone que não é B nem C: não é resposta a envio nosso
      else via = "outro_jid";
      const respondeAEnvio =
        via !== "de_fora" && (rotulo ? enviados.some((e) => e.para === rotulo && e.em <= chegada) : primeiroEnvio !== null && primeiroEnvio <= chegada);
      return {
        seq,
        rotulo: rotulo ?? "?",
        via,
        respondeAEnvio,
        ackAntes,
        altTipo,
        addressingMode: addressingMode ?? "-",
        chavesDaKey: Object.keys(d.key).sort().join(","),
        tipo: Object.keys(d.message ?? {}).find((k) => k !== "messageContextInfo") ?? "?",
      };
    });

  const amostras = linhas.filter((l) => l.respondeAEnvio);
  const orfas = amostras.filter((l) => l.via === "lid_orfao" || l.via === "outro_jid");
  const veredito = amostras.length < 3 ? "INCONCLUSIVO" : orfas.length ? "NO-GO" : "GO";

  const proprios = upserts.filter((x) => x.d.key.fromMe);
  const entregas = enviados.map((e) => {
    const deles = atualizacoes.filter((u) => u.d.keyId === e.keyId);
    const quando = (status) => deles.find((u) => u.d.status === status)?.chegada;
    const [entrega, leitura] = [quando("DELIVERY_ACK"), quando("READ")];
    return {
      para: e.para,
      entregaS: entrega ? segundos(e.em, entrega) : null,
      leituraS: leitura ? segundos(e.em, leitura) : null,
      statuses: [...new Set(deles.map((u) => u.d.status))],
      fromMe: [...new Set(deles.map((u) => u.d.fromMe))],
    };
  });
  return {
    linhas,
    amostras: amostras.length,
    orfas: orfas.length,
    deFora: linhas.filter((l) => l.via === "de_fora").length,
    veredito,
    ecoDoEnvio: `${proprios.filter((x) => idsEnviados.has(x.d.key.id)).length}/${enviados.length}`,
    peloCelular: proprios.filter((x) => !idsEnviados.has(x.d.key.id)).length,
    // se o keyId do update não casa com o key.id do envio, isto sai 0 de N: o status por mensagem não funcionaria
    updatesCasados: `${atualizacoes.filter((u) => idsEnviados.has(u.d.keyId)).length}/${atualizacoes.length}`,
    entregas,
  };
}

function main() {
  const bruto = dirBruto();
  const r = classificar({ eventos: eventosDaRota(bruto, "evo"), enviados: lerEstado(bruto).enviados ?? [], celulares: celulares() });
  for (const l of r.linhas) {
    console.log(`#${String(l.seq).padStart(3, "0")} ${l.rotulo} via=${l.via} responde_a_envio=${l.respondeAEnvio} ack_antes=${l.ackAntes} alt=${l.altTipo} addressingMode=${l.addressingMode} tipo=${l.tipo} key=[${l.chavesDaKey}]`);
  }
  for (const e of r.entregas) {
    console.log(`envio para ${e.para}: entrega=${e.entregaS ?? "sem DELIVERY_ACK"} s, leitura=${e.leituraS ?? "sem READ"} s, status_vistos=[${e.statuses.join(",")}] fromMe_no_update=[${e.fromMe.join(",")}]`);
  }
  console.log(`messages.update de mensagens nossas (casados por keyId): ${r.updatesCasados}`);
  console.log(`eco do envio como messages.upsert fromMe: ${r.ecoDoEnvio} | mensagens "pelo celular": ${r.peloCelular}`);
  console.log(`mensagens de telefone que não é B nem C (fora da amostra): ${r.deFora}`);
  console.log(`VEREDITO: ${r.veredito} (${r.amostras} respostas a envios nossos, ${r.orfas} sem ligação determinística)`);
  process.exit(r.veredito === "GO" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
