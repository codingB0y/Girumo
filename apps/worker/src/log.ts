/**
 * Log estruturado em JSON, uma linha por evento, para stdout/stderr.
 *
 * REGRA: nada de PII. Nunca passar telefone, nome ou conteúdo de mensagem em
 * `fields` — só ids (uuid), JIDs de grupo e contagens. Ver README.evolution.md,
 * "nunca logar o payload cru".
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};
