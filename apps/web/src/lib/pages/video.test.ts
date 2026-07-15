import assert from "node:assert/strict";
import { parseVideoUrl } from "./video";

// YouTube — todas as formas comuns viram o mesmo id de 11 chars
assert.deepEqual(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), {
  provider: "youtube",
  id: "dQw4w9WgXcQ",
});
assert.deepEqual(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ"), {
  provider: "youtube",
  id: "dQw4w9WgXcQ",
});
assert.deepEqual(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), {
  provider: "youtube",
  id: "dQw4w9WgXcQ",
});
assert.deepEqual(parseVideoUrl("https://youtube.com/embed/dQw4w9WgXcQ"), {
  provider: "youtube",
  id: "dQw4w9WgXcQ",
});
// parâmetros extras (timestamp, playlist) são descartados
assert.deepEqual(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), {
  provider: "youtube",
  id: "dQw4w9WgXcQ",
});

// Vimeo — id numérico
assert.deepEqual(parseVideoUrl("https://vimeo.com/123456789"), {
  provider: "vimeo",
  id: "123456789",
});
assert.deepEqual(parseVideoUrl("https://player.vimeo.com/video/123456789"), {
  provider: "vimeo",
  id: "123456789",
});
// vimeo não listado (id + hash) → mantém só o id
assert.deepEqual(parseVideoUrl("https://vimeo.com/123456789/abc123hash"), {
  provider: "vimeo",
  id: "123456789",
});

// rejeições — URL arbitrária, páginas não-vídeo, HTML/iframe, esquemas perigosos
assert.equal(parseVideoUrl("https://example.com/video"), null);
assert.equal(parseVideoUrl("https://www.youtube.com/channel/UCabcdef"), null);
assert.equal(parseVideoUrl("https://vimeo.com/channels/staffpicks"), null);
assert.equal(parseVideoUrl('<iframe src="https://youtube.com/embed/dQw4w9WgXcQ"></iframe>'), null);
assert.equal(parseVideoUrl("javascript:alert(1)"), null);
assert.equal(parseVideoUrl(""), null);
assert.equal(parseVideoUrl("not a url"), null);
assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=short"), null); // id < 11 chars

console.log("video tests passed");
