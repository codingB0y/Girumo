import assert from "node:assert/strict";
import { parseFunnelFields } from "./api";

const RUN = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

// Ausentes: nao e funil.
assert.deepEqual(parseFunnelFields({}), { ok: true, fields: null });
// Completo e valido.
assert.deepEqual(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: RUN }), {
  ok: true,
  fields: { funnel_template_id: "live", funnel_run_id: RUN },
});
// Um sem o outro: erro distingue "faltou" de "invalido" (mensagem que o PR 2 exibe).
const soTemplate = parseFunnelFields({ funnelTemplateId: "live" });
assert.equal(soTemplate.ok, false);
assert.equal(!soTemplate.ok && soTemplate.error, "Informe funnelTemplateId e funnelRunId juntos.");
const soRun = parseFunnelFields({ funnelRunId: RUN });
assert.equal(soRun.ok, false);
assert.equal(!soRun.ok && soRun.error, "Informe funnelTemplateId e funnelRunId juntos.");
// Roteiro desconhecido.
assert.equal(parseFunnelFields({ funnelTemplateId: "nope", funnelRunId: RUN }).ok, false);
// Run id que nao e uuid.
assert.equal(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: "123" }).ok, false);
// Tipos errados.
assert.equal(parseFunnelFields({ funnelTemplateId: 1, funnelRunId: RUN }).ok, false);

// Ancora do regex de uuid: lixo em volta de um uuid valido tem que reprovar,
// senao "<uuid>\nDROP TABLE" ou "xx<uuid>yy" viram valor gravado no banco.
assert.equal(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: `x${RUN}` }).ok, false);
assert.equal(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: `${RUN}x` }).ok, false);
assert.equal(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: `${RUN}\nDROP TABLE` }).ok, false);

console.log("funnels/api tests passed");
