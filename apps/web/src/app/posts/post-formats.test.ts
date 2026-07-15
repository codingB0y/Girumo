import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { POST_FORMATS, resolvePostFormat } from "./post-formats";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const route = read("src/app/posts/og/route.tsx");
const gallery = read("src/components/posts/post-gallery.tsx");
const page = read("src/app/posts/page.tsx");
const layout = read("src/app/posts/layout.tsx");

const TEMPLATE_IDS = [
  "1.1-capa",
  "1.1-problema",
  "1.1-solucao",
  "1.1-cta",
  "1.2-confessa",
  "2.2-sabia",
  "2.3-capa",
  "2.3-01",
  "2.3-02",
  "2.3-03",
  "2.3-04",
  "2.3-05",
  "2.3-cta",
  "3.1-numero",
  "4.1-semdesculpa",
  "4.2-quanto",
  "5.2-dado",
] as const;

test("defines the four immutable Girumo social formats", () => {
  assert.deepEqual(POST_FORMATS.square, { width: 1080, height: 1080 });
  assert.deepEqual(POST_FORMATS.portrait, { width: 1080, height: 1350 });
  assert.deepEqual(POST_FORMATS.story, { width: 1080, height: 1920 });
  assert.deepEqual(POST_FORMATS.videoCover, { width: 1920, height: 1080 });
  assert.ok(Object.isFrozen(POST_FORMATS));
  for (const value of Object.values(POST_FORMATS)) assert.ok(Object.isFrozen(value));
});

test("resolves missing and unknown formats to portrait", () => {
  assert.deepEqual(resolvePostFormat(), { key: "portrait", width: 1080, height: 1350 });
  assert.deepEqual(resolvePostFormat(null), { key: "portrait", width: 1080, height: 1350 });
  assert.deepEqual(resolvePostFormat("unknown"), { key: "portrait", width: 1080, height: 1350 });
  assert.deepEqual(resolvePostFormat("videoCover"), { key: "videoCover", width: 1920, height: 1080 });
});

test("derives ImageResponse dimensions and identity from approved sources", () => {
  assert.match(route, /resolvePostFormat\(searchParams\.get\(["']format["']\)\)/);
  assert.match(route, /width:\s*format\.width/);
  assert.match(route, /height:\s*format\.height/);
  assert.match(route, /GIRUMO_PATHS\.map/);
  assert.match(route, /BRAND\.name/);
  for (const token of ["volt", "paper", "canvas", "acid"] as const) {
    assert.match(route, new RegExp(`BRAND_COLORS\\.${token}`));
  }
  assert.match(route, /Manrope/);
  assert.match(route, /PlexSans/);
  assert.match(route, /PlexMono/);
});

test("preserves every existing template id", () => {
  const actual = [...page.matchAll(/id:\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(actual, [...TEMPLATE_IDS]);
});

test("provides coherent product, video, founder proof and metric modes", () => {
  for (const mode of ["ProductMessage", "VideoThumbnail", "FounderProof", "MetricCard"]) {
    assert.match(route, new RegExp(`function\\s+${mode}\\b`));
  }
  assert.match(route, /Mega Stock/);
  assert.match(route, /R\$\s*5\s*mil\s*→\s*R\$\s*350\s*mil/);
  assert.doesNotMatch(route, /border(?:Left|Top):[^\n]+:\s*undefined/);
  assert.match(route, /\.\.\.\(story\s*\?\s*\{\s*width:\s*"100%"\s*\}\s*:\s*\{\s*flex:\s*1\s*\}\)/);
});

test("offers all formats and preserves format in preview and downloads", () => {
  for (const key of ["square", "portrait", "story", "videoCover"]) {
    assert.match(gallery, new RegExp(`["']${key}["']`));
  }
  assert.match(gallery, /URLSearchParams\(\{\s*t:\s*id,\s*format\s*\}\)/);
  assert.match(gallery, /girumo-post-\$\{id\}-\$\{format\}\.png/);
  assert.match(gallery, /aspectRatio:\s*`\$\{dimensions\.width\}\s*\/\s*\$\{dimensions\.height\}`/);
  assert.match(gallery, /if\s*\(!res\.ok\)/);
  assert.match(gallery, /let\s+objectUrl:\s*string\s*\|\s*null\s*=\s*null/);
  assert.match(gallery, /finally\s*\{\s*if\s*\(objectUrl\)\s*URL\.revokeObjectURL\(objectUrl\)/s);
});

test("removes the old public social identity and generic visual effects", () => {
  const source = `${route}\n${gallery}\n${page}\n${layout}`;
  const nonInteractiveSource = `${route}\n${page}\n${layout}`;
  assert.doesNotMatch(source, /HubFlow|hubflow\.com\.br|o fluxo que vende|Bricolage|#6a4bf0|#8a6cff|dispara/i);
  assert.doesNotMatch(source, /gradient|glow|glass|radial-gradient|linear-gradient/i);
  assert.doesNotMatch(nonInteractiveSource, /cobalt/i);
  assert.match(page, /title:\s*\{\s*absolute:/);
  assert.match(gallery, /await\s+new Promise[^;]+setTimeout/s);
});
