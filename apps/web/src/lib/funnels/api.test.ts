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
// Um sem o outro.
assert.equal(parseFunnelFields({ funnelTemplateId: "live" }).ok, false);
assert.equal(parseFunnelFields({ funnelRunId: RUN }).ok, false);
// Roteiro desconhecido.
assert.equal(parseFunnelFields({ funnelTemplateId: "nope", funnelRunId: RUN }).ok, false);
// Run id que nao e uuid.
assert.equal(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: "123" }).ok, false);
// Tipos errados.
assert.equal(parseFunnelFields({ funnelTemplateId: 1, funnelRunId: RUN }).ok, false);

console.log("funnels/api tests passed");
