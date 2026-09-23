import assert from "node:assert/strict";
import { parseTemplateMedia } from "./template-media";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const idDe = (tenant: string) => Buffer.from(`${tenant}/media/abc.jpg`, "utf8").toString("base64url");

assert.equal(parseTemplateMedia(undefined, TENANT), undefined, "campo ausente não mexe no anexo");
assert.deepEqual(parseTemplateMedia(null, TENANT), { media_id: null, media_type: null, media_name: null });

assert.deepEqual(parseTemplateMedia({ media_id: idDe(TENANT), media_type: "video", media_name: " a.mp4 " }, TENANT), {
  media_id: idDe(TENANT),
  media_type: "video",
  media_name: "a.mp4",
});

assert.throws(() => parseTemplateMedia({ media_id: idDe(OUTRO), media_type: "image" }, TENANT), /não encontrado/);
assert.throws(() => parseTemplateMedia({ media_id: idDe(TENANT), media_type: "audio" }, TENANT), /foto ou vídeo/);
assert.throws(() => parseTemplateMedia({ media_id: "../x", media_type: "image" }, TENANT), /não encontrado/);
assert.throws(() => parseTemplateMedia("x", TENANT), /inválido/);
