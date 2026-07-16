import assert from "node:assert/strict";
import { mediaSrc, mediaPosition } from "./media";

// mediaSrc — media_id é o caminho preferido (derivado servido por /api/media/:id);
// url é o fallback (legado/externo). NUNCA serve o arquivo-fonte cru diretamente.
assert.equal(mediaSrc({ media_id: "abc123", alt: "foto" }), "/api/media/abc123");
assert.equal(mediaSrc({ url: "https://cdn.exemplo.com/foto.jpg", alt: "foto" }), "https://cdn.exemplo.com/foto.jpg");
// media_id vence quando ambos estão presentes
assert.equal(
  mediaSrc({ media_id: "abc123", url: "https://cdn.exemplo.com/foto.jpg", alt: "foto" }),
  "/api/media/abc123",
);
// id com caractere especial é encodado (defesa)
assert.equal(mediaSrc({ media_id: "a/b?c", alt: "x" }), "/api/media/a%2Fb%3Fc");
// sem media_id nem url → string vazia (não deve acontecer pós-validação)
assert.equal(mediaSrc({ alt: "x" }), "");

// mediaPosition — ponto focal normalizado (0..1) → object-position; centro por padrão.
assert.equal(mediaPosition({ url: "x", alt: "x" }), "50% 50%");
assert.equal(mediaPosition({ url: "x", alt: "x", focal_x: 0, focal_y: 1 }), "0% 100%");
assert.equal(mediaPosition({ url: "x", alt: "x", focal_x: 0.25, focal_y: 0.75 }), "25% 75%");
// fora do intervalo é clampado
assert.equal(mediaPosition({ url: "x", alt: "x", focal_x: 1.5, focal_y: -0.2 }), "100% 0%");

console.log("media tests passed");
