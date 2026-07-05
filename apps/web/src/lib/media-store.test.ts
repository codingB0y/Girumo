import assert from "node:assert/strict";
import test from "node:test";
import { mediaPathBelongsToTenant } from "./media-path";

test("aceita somente path de mídia do tenant", () => {
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";

  assert.equal(mediaPathBelongsToTenant(`${tenantA}/media/file.jpg`, tenantA), true);
  assert.equal(mediaPathBelongsToTenant(`${tenantB}/media/file.jpg`, tenantA), false);
  assert.equal(mediaPathBelongsToTenant(`${tenantA}/media/../secret.jpg`, tenantA), false);
});
