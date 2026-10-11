import assert from "node:assert/strict";
import test from "node:test";
import { mediaPathBelongsToTenant } from "./media-path";
import { prepareMediaUpload } from "./media-store";

test("aceita somente path de mídia do tenant", () => {
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";

  assert.equal(mediaPathBelongsToTenant(`${tenantA}/media/file.jpg`, tenantA), true);
  assert.equal(mediaPathBelongsToTenant(`${tenantB}/media/file.jpg`, tenantA), false);
  assert.equal(mediaPathBelongsToTenant(`${tenantA}/media/../secret.jpg`, tenantA), false);
});

test("prepareMediaUpload é assíncrono e recusa vídeo em kind de LP com 415 antes de tocar no Storage", async () => {
  const tenant = "11111111-1111-4111-8111-111111111111";
  await assert.rejects(
    prepareMediaUpload("video/mp4", tenant, "lp-media"),
    (e: unknown) => e instanceof Response && e.status === 415,
  );
});
