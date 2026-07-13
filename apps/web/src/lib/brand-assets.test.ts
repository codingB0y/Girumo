import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const root = path.join(process.cwd(), "public", "brand", "girumo");
const svgFiles = [
  "svg/girumo-symbol-volt.svg",
  "svg/girumo-symbol-canvas.svg",
  "svg/girumo-symbol-black.svg",
  "svg/girumo-lockup-horizontal-volt.svg",
  "svg/girumo-lockup-horizontal-canvas.svg",
  "svg/girumo-lockup-stacked-volt.svg",
  "svg/girumo-wordmark-volt.svg",
] as const;
const pngSizes = [16, 32, 48, 180, 192, 512, 1024] as const;
const pngFiles = pngSizes.map((size) => `png/symbol-${size}.png`);
const expected = [
  ...svgFiles,
  ...pngFiles,
  "social/instagram-avatar-1080.png",
  "social/instagram-avatar-dark-1080.png",
  "social/og-default-1200x630.png",
  "email/girumo-email-lockup-640x160.png",
  "favicon.ico",
];

const COLORS = {
  volt: [0x07, 0x19, 0x23],
  acid: [0xa7, 0xff, 0x2f],
  canvas: [0xf4, 0xf0, 0xe7],
} as const;

function asset(relative: string): string {
  const absolute = path.join(root, relative);
  assert.ok(existsSync(absolute), relative);
  return absolute;
}

function assertRgb(
  actual: readonly number[],
  expectedColor: readonly number[],
  message: string,
  tolerance = 0,
): void {
  assert.equal(actual.length, 3);
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(
      Math.abs(actual[channel] - expectedColor[channel]) <= tolerance,
      `${message}: channel ${channel} was ${actual[channel]}`,
    );
  }
}

async function assertSrgb(relative: string, width: number, height: number): Promise<void> {
  const metadata = await sharp(asset(relative)).metadata();
  assert.equal(metadata.width, width, `${relative} width`);
  assert.equal(metadata.height, height, `${relative} height`);
  assert.equal(metadata.space, "srgb", `${relative} color space`);
}

async function avatarSymbolBounds(
  relative: string,
  background: readonly [number, number, number],
  foreground: readonly [number, number, number],
): Promise<{ width: number; height: number }> {
  const { data, info } = await sharp(asset(relative)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  assertRgb([...data.subarray(0, 3)], background, `${relative} background`);

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const pixel = [data[offset], data[offset + 1], data[offset + 2]];
      const differsFromBackground = pixel.some((value, channel) => Math.abs(value - background[channel]) > 3);
      const matchesForeground = pixel.every((value, channel) => Math.abs(value - foreground[channel]) <= 3);
      if (matchesForeground) foregroundPixels += 1;
      if (!differsFromBackground) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  assert.ok(foregroundPixels > 100_000, `${relative} must contain the approved foreground color`);
  assert.ok(maxX >= minX && maxY >= minY, `${relative} symbol bounds`);
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

test("exports the complete Girumo asset set", () => {
  for (const relative of expected) assert.ok(existsSync(path.join(root, relative)), relative);
});

test("exports outlined wordmarks instead of SVG text", () => {
  const wordmark = readFileSync(asset("svg/girumo-wordmark-volt.svg"), "utf8");
  assert.doesNotMatch(wordmark, /<text\b|<image\b/i);
  assert.equal((wordmark.match(/<path\b/g) || []).length, 6);
});

test("exports valid, unclipped SVG path geometry", async () => {
  for (const relative of svgFiles) {
    const source = readFileSync(asset(relative), "utf8");
    assert.doesNotMatch(source, /<image\b|<text\b/i, relative);

    const image = sharp(Buffer.from(source)).resize({
      width: 512,
      height: 512,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    const metadata = await image.metadata();
    assert.ok((metadata.width ?? 0) > 0, `${relative} width`);
    assert.ok((metadata.height ?? 0) > 0, `${relative} height`);

    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaquePixels = 0;
    let boundaryAlpha = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alpha = data[(y * info.width + x) * info.channels + 3];
        if (alpha > 0) opaquePixels += 1;
        if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) {
          boundaryAlpha = Math.max(boundaryAlpha, alpha);
        }
      }
    }
    assert.ok(opaquePixels > 0, `${relative} rendered zero-sized output`);
    assert.equal(boundaryAlpha, 0, `${relative} geometry touches the raster boundary`);
  }
});

test("exports transparent sRGB symbols at every approved PNG size", async () => {
  for (const size of pngSizes) {
    const relative = `png/symbol-${size}.png`;
    const input = sharp(asset(relative));
    const metadata = await input.metadata();
    assert.equal(metadata.width, size, `${relative} width`);
    assert.equal(metadata.height, size, `${relative} height`);
    assert.equal(metadata.space, "srgb", `${relative} color space`);
    assert.equal(metadata.hasAlpha, true, `${relative} alpha channel`);

    const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = Array.from({ length: info.width * info.height }, (_, index) => data[index * info.channels + 3]);
    assert.ok(alpha.includes(0), `${relative} transparent pixels`);
    assert.ok(alpha.includes(255), `${relative} opaque pixels`);
    assert.equal(alpha[0], 0, `${relative} transparent corner`);
  }
});

test("keeps the stepped passage open at 16 device pixels", async () => {
  const { data, info } = await sharp(asset("png/symbol-16.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (const y of [3, 5, 7, 9, 11, 13]) {
    const row = Array.from(
      { length: info.width },
      (_, x) => data[(y * info.width + x) * info.channels + 3],
    );
    const occupied = row.flatMap((alpha, x) => (alpha >= 128 ? [x] : []));
    assert.ok(occupied.length > 1, `row ${y} must contain both symbol halves`);
    const passage = row.slice(Math.min(...occupied) + 1, Math.max(...occupied));
    assert.ok(passage.includes(0), `row ${y} passage must contain a fully transparent pixel`);
  }
});

test("exports the social and email raster formats in sRGB", async () => {
  await assertSrgb("social/instagram-avatar-1080.png", 1080, 1080);
  await assertSrgb("social/instagram-avatar-dark-1080.png", 1080, 1080);
  await assertSrgb("social/og-default-1200x630.png", 1200, 630);
  await assertSrgb("email/girumo-email-lockup-640x160.png", 640, 160);

  const { data, info } = await sharp(asset("email/girumo-email-lockup-640x160.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += info.channels) {
    assert.equal(data[index], 255, "email lockup must be opaque");
  }
});

test("uses the approved avatar colorways and 61% symbol occupancy", async () => {
  const avatars = [
    {
      relative: "social/instagram-avatar-1080.png",
      background: COLORS.acid,
      foreground: COLORS.volt,
    },
    {
      relative: "social/instagram-avatar-dark-1080.png",
      background: COLORS.volt,
      foreground: COLORS.canvas,
    },
  ] as const;

  for (const avatar of avatars) {
    const bounds = await avatarSymbolBounds(avatar.relative, avatar.background, avatar.foreground);
    assert.ok(Math.abs(bounds.width / 1080 - 0.61) <= 0.005, `${avatar.relative} width occupancy: ${bounds.width}`);
    assert.ok(Math.abs(bounds.height / 1080 - 0.61) <= 0.005, `${avatar.relative} height occupancy: ${bounds.height}`);
  }
});

test("exports only production black in the black symbol SVG", () => {
  const source = readFileSync(asset("svg/girumo-symbol-black.svg"), "utf8");
  const fills = [...source.matchAll(/fill="([^"]+)"/gi)].map((match) => match[1].toUpperCase());
  assert.ok(fills.length > 0);
  assert.deepEqual([...new Set(fills)], ["#000000"]);
});

test("packs exactly the 16, 32, and 48 px favicon entries", () => {
  const ico = readFileSync(asset("favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0, "ICO reserved header");
  assert.equal(ico.readUInt16LE(2), 1, "ICO image type");
  const count = ico.readUInt16LE(4);
  assert.equal(count, 3);

  const sizes = Array.from({ length: count }, (_, index) => {
    const width = ico.readUInt8(6 + index * 16);
    const height = ico.readUInt8(7 + index * 16);
    assert.equal(width, height, `ICO entry ${index} must be square`);
    return width === 0 ? 256 : width;
  });
  assert.deepEqual(sizes.sort((left, right) => left - right), [16, 32, 48]);
});
