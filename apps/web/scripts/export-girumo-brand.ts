import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import * as fontkit from "fontkit";
import pngToIco from "png-to-ico";
import sharp from "sharp";
import { BRAND } from "../src/lib/brand";
import {
  GIRUMO_MICRO_PATHS,
  GIRUMO_PATHS,
  GIRUMO_VIEWBOX,
  renderGirumoSymbolSvg,
} from "../src/lib/girumo-symbol";

const require = createRequire(import.meta.url);
const MANROPE_PATH = require.resolve("@fontsource/manrope/files/manrope-latin-700-normal.woff2");
const OUTPUT = path.join(process.cwd(), "public", "brand", "girumo");
const COLORS = { volt: "#071923", acid: "#A7FF2F", canvas: "#F4F0E7", black: "#000000" } as const;
const PNG_SIZES = [16, 32, 48, 180, 192, 512, 1024] as const;
const WORDMARK = "Girumo";
const AVATAR_SYMBOL_OCCUPANCY = 0.61;
const PAIR_ADJUST_EM = { Gi: -0.012, ir: 0.016, um: -0.01, mo: -0.01 } as const;
const LOCKUP = { symbolToCapHeight: 1.06, gapToOWidth: 0.5, opticalYEm: -0.015 } as const;
const SYMBOL_BOUNDS = { minX: 2, minY: 2, maxX: 22, maxY: 22 } as const;
const SVG_PADDING = 0.02;

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type GlyphRecord = {
  d: string;
  transform: string;
  x: number;
  bounds: Bounds;
};

type OutlinedRun = {
  paths: GlyphRecord[];
  bounds: Bounds;
  viewBox: Bounds;
  advance: number;
  unitsPerEm: number;
};

type VectorComposition = {
  paths: string;
  viewBox: Bounds;
};

type OutlineFont = {
  unitsPerEm: number;
  ascent: number;
  capHeight: number;
  layout(text: string): {
    glyphs: Array<{
      path: {
        toSVG(): string;
        bbox: Bounds;
      };
    }>;
    positions: Array<{ xOffset: number; xAdvance: number }>;
  };
};

function rounded(value: number): number {
  const result = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(result, -0) ? 0 : result;
}

function number(value: number): string {
  return String(rounded(value));
}

function width(bounds: Bounds): number {
  return bounds.maxX - bounds.minX;
}

function height(bounds: Bounds): number {
  return bounds.maxY - bounds.minY;
}

function union(bounds: Bounds[]): Bounds {
  if (bounds.length === 0) throw new Error("Cannot derive an empty vector viewBox");
  return {
    minX: Math.min(...bounds.map((item) => item.minX)),
    minY: Math.min(...bounds.map((item) => item.minY)),
    maxX: Math.max(...bounds.map((item) => item.maxX)),
    maxY: Math.max(...bounds.map((item) => item.maxY)),
  };
}

function translateBounds(bounds: Bounds, x: number, y: number): Bounds {
  return {
    minX: bounds.minX + x,
    minY: bounds.minY + y,
    maxX: bounds.maxX + x,
    maxY: bounds.maxY + y,
  };
}

function padded(bounds: Bounds, fraction = SVG_PADDING): Bounds {
  const x = width(bounds) * fraction;
  const y = height(bounds) * fraction;
  return {
    minX: bounds.minX - x,
    minY: bounds.minY - y,
    maxX: bounds.maxX + x,
    maxY: bounds.maxY + y,
  };
}

function viewBox(bounds: Bounds): string {
  return [bounds.minX, bounds.minY, width(bounds), height(bounds)].map(number).join(" ");
}

function svgDocument(bounds: Bounds, paths: string): string {
  const intrinsicHeight = 240;
  const intrinsicWidth = rounded((width(bounds) / height(bounds)) * intrinsicHeight);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(bounds)}" width="${intrinsicWidth}" height="${intrinsicHeight}" aria-hidden="true">${paths}</svg>`;
}

function symbolPaths(color: string): string {
  return GIRUMO_PATHS.map((d) => `<path fill="${color}" d="${d}"/>`).join("");
}

function renderSymbolWithPaths(paths: readonly string[], color: string, size: number): string {
  const geometry = paths.map((d) => `<path fill="${color}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GIRUMO_VIEWBOX}" width="${size}" height="${size}" aria-hidden="true">${geometry}</svg>`;
}

function outlineWordmark(font: OutlineFont): OutlinedRun {
  const bold = font;
  const run = bold.layout(WORDMARK);
  if (run.glyphs.length !== WORDMARK.length) {
    throw new Error(`Girumo must export as exactly six glyphs, received ${run.glyphs.length}`);
  }

  const tracking = -0.03 * bold.unitsPerEm;
  let penX = 0;
  const paths = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const x = rounded(penX + position.xOffset);
    const glyphBounds = glyph.path.bbox;
    const transformedBounds = {
      minX: x + glyphBounds.minX,
      minY: bold.ascent - glyphBounds.maxY,
      maxX: x + glyphBounds.maxX,
      maxY: bold.ascent - glyphBounds.minY,
    };
    const pair = WORDMARK.slice(index, index + 2) as keyof typeof PAIR_ADJUST_EM;
    const pairAdjustment = (PAIR_ADJUST_EM[pair] ?? 0) * bold.unitsPerEm;
    penX += position.xAdvance + (index < run.glyphs.length - 1 ? tracking + pairAdjustment : 0);
    return {
      d: glyph.path.toSVG(),
      transform: `translate(${number(x)} ${number(bold.ascent)}) scale(1 -1)`,
      x,
      bounds: transformedBounds,
    };
  });
  const bounds = union(paths.map((pathRecord) => pathRecord.bounds));
  return {
    paths,
    bounds,
    viewBox: padded(bounds),
    advance: rounded(penX),
    unitsPerEm: bold.unitsPerEm,
  };
}

function outlineText(font: OutlineFont, text: string): OutlinedRun {
  const bold = font;
  const run = bold.layout(text);
  let penX = 0;
  const paths = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const x = rounded(penX + position.xOffset);
    const glyphBounds = glyph.path.bbox;
    penX += position.xAdvance;
    return {
      d: glyph.path.toSVG(),
      transform: `translate(${number(x)} ${number(bold.ascent)}) scale(1 -1)`,
      x,
      bounds: {
        minX: x + glyphBounds.minX,
        minY: bold.ascent - glyphBounds.maxY,
        maxX: x + glyphBounds.maxX,
        maxY: bold.ascent - glyphBounds.minY,
      },
    };
  });
  const bounds = union(paths.map((pathRecord) => pathRecord.bounds));
  return {
    paths,
    bounds,
    viewBox: padded(bounds),
    advance: rounded(penX),
    unitsPerEm: bold.unitsPerEm,
  };
}

function glyphPaths(run: OutlinedRun, color: string): string {
  return run.paths
    .map(({ d, transform }) => `<path d="${d}" fill="${color}" transform="${transform}"/>`)
    .join("");
}

function translatedGlyphPaths(run: OutlinedRun, color: string, x: number, y: number): string {
  return `<g transform="translate(${number(x)} ${number(y)})">${glyphPaths(run, color)}</g>`;
}

function horizontalLockup(font: OutlineFont, wordmark: OutlinedRun, color: string): VectorComposition {
  const bold = font;
  const symbolSize = bold.capHeight * LOCKUP.symbolToCapHeight;
  const symbolScale = symbolSize / height(SYMBOL_BOUNDS);
  const oWidth = width(wordmark.paths[wordmark.paths.length - 1].bounds);
  const gap = oWidth * LOCKUP.gapToOWidth;
  const capCenter = bold.ascent - bold.capHeight / 2;
  const symbolTop = capCenter - symbolSize / 2 + LOCKUP.opticalYEm * bold.unitsPerEm;
  const symbolTranslateX = -SYMBOL_BOUNDS.minX * symbolScale;
  const symbolTranslateY = symbolTop - SYMBOL_BOUNDS.minY * symbolScale;
  const wordmarkTranslateX = symbolSize + gap - wordmark.bounds.minX;
  const symbolBounds = { minX: 0, minY: symbolTop, maxX: symbolSize, maxY: symbolTop + symbolSize };
  const wordmarkBounds = translateBounds(wordmark.bounds, wordmarkTranslateX, 0);
  const bounds = union([symbolBounds, wordmarkBounds]);
  const paths = [
    `<g transform="translate(${number(symbolTranslateX)} ${number(symbolTranslateY)}) scale(${number(symbolScale)})">${symbolPaths(color)}</g>`,
    translatedGlyphPaths(wordmark, color, wordmarkTranslateX, 0),
  ].join("");
  return { paths, viewBox: padded(bounds) };
}

function stackedLockup(font: OutlineFont, wordmark: OutlinedRun, color: string): VectorComposition {
  const bold = font;
  const symbolSize = bold.capHeight * LOCKUP.symbolToCapHeight;
  const symbolScale = symbolSize / height(SYMBOL_BOUNDS);
  const oWidth = width(wordmark.paths[wordmark.paths.length - 1].bounds);
  const gap = oWidth * LOCKUP.gapToOWidth;
  const wordmarkWidth = width(wordmark.bounds);
  const symbolLeft = (wordmarkWidth - symbolSize) / 2;
  const symbolTranslateX = symbolLeft - SYMBOL_BOUNDS.minX * symbolScale;
  const symbolTranslateY = -SYMBOL_BOUNDS.minY * symbolScale;
  const wordmarkTranslateX = -wordmark.bounds.minX;
  const wordmarkTranslateY = symbolSize + gap - wordmark.bounds.minY;
  const bounds = {
    minX: Math.min(0, symbolLeft),
    minY: 0,
    maxX: Math.max(wordmarkWidth, symbolLeft + symbolSize),
    maxY: symbolSize + gap + height(wordmark.bounds),
  };
  const paths = [
    `<g transform="translate(${number(symbolTranslateX)} ${number(symbolTranslateY)}) scale(${number(symbolScale)})">${symbolPaths(color)}</g>`,
    translatedGlyphPaths(wordmark, color, wordmarkTranslateX, wordmarkTranslateY),
  ].join("");
  return { paths, viewBox: padded(bounds) };
}

function generatedWordmarkModule(wordmark: OutlinedRun): string {
  const records = wordmark.paths
    .map(
      ({ d, transform }) =>
        `  { d: ${JSON.stringify(d)}, transform: ${JSON.stringify(transform)} },`,
    )
    .join("\n");
  return [
    "// Generated by npm run brand:export. Do not edit manually.",
    `export const GIRUMO_WORDMARK_VIEWBOX = ${JSON.stringify(viewBox(wordmark.viewBox))};`,
    "export const GIRUMO_WORDMARK_PATHS = [",
    records,
    "] as const;",
    `export const GIRUMO_WORDMARK_ASPECT_RATIO = ${number(width(wordmark.viewBox) / height(wordmark.viewBox))};`,
    "",
  ].join("\n");
}

function placedComposition(composition: VectorComposition, x: number, y: number, maxWidth: number, maxHeight: number): string {
  const scale = Math.min(maxWidth / width(composition.viewBox), maxHeight / height(composition.viewBox));
  const renderedWidth = width(composition.viewBox) * scale;
  const renderedHeight = height(composition.viewBox) * scale;
  const translateX = x + (maxWidth - renderedWidth) / 2;
  const translateY = y + (maxHeight - renderedHeight) / 2;
  return `<g transform="translate(${number(translateX)} ${number(translateY)}) scale(${number(scale)}) translate(${number(-composition.viewBox.minX)} ${number(-composition.viewBox.minY)})">${composition.paths}</g>`;
}

function avatarSvg(background: string, foreground: string): string {
  const canvas = 1080;
  const symbolSize = canvas * AVATAR_SYMBOL_OCCUPANCY;
  const scale = symbolSize / width(SYMBOL_BOUNDS);
  const visualLeft = (canvas - symbolSize) / 2;
  const translate = visualLeft - SYMBOL_BOUNDS.minX * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${canvas}" height="${canvas}"><path fill="${background}" d="M0 0H${canvas}V${canvas}H0Z"/><g transform="translate(${number(translate)} ${number(translate)}) scale(${number(scale)})">${symbolPaths(foreground)}</g></svg>`;
}

function ogSvg(font: OutlineFont, lockup: VectorComposition): string {
  const tagline = outlineText(font, BRAND.tagline);
  const taglineScale = Math.min(1020 / width(tagline.bounds), 54 / height(tagline.bounds));
  const taglineX = 90;
  const taglineY = 430;
  const taglinePaths = `<g transform="translate(${taglineX} ${taglineY}) scale(${number(taglineScale)}) translate(${number(-tagline.bounds.minX)} ${number(-tagline.bounds.minY)})">${glyphPaths(tagline, COLORS.acid)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><path fill="${COLORS.volt}" d="M0 0H1200V630H0Z"/>${placedComposition(lockup, 90, 145, 780, 180)}${taglinePaths}</svg>`;
}

function emailSvg(lockup: VectorComposition): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160" width="640" height="160"><path fill="${COLORS.volt}" d="M0 0H640V160H0Z"/>${placedComposition(lockup, 50, 24, 540, 112)}</svg>`;
}

async function png(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .toColourspace("srgb")
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })
    .toBuffer();
}

async function passageIsOpen(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const y of [3, 5, 7, 9, 11, 13]) {
    const row = Array.from(
      { length: info.width },
      (_, x) => data[(y * info.width + x) * info.channels + 3],
    );
    const occupied = row.flatMap((alpha, x) => (alpha >= 128 ? [x] : []));
    if (occupied.length < 2) return false;
    if (!row.slice(Math.min(...occupied) + 1, Math.max(...occupied)).includes(0)) return false;
  }
  return true;
}

async function write(relative: string, contents: string | Buffer): Promise<void> {
  const target = path.join(OUTPUT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function exportBrand(font: OutlineFont): Promise<void> {
  const wordmark = outlineWordmark(font);
  const horizontalVolt = horizontalLockup(font, wordmark, COLORS.volt);
  const horizontalCanvas = horizontalLockup(font, wordmark, COLORS.canvas);
  const stackedVolt = stackedLockup(font, wordmark, COLORS.volt);

  await write("svg/girumo-symbol-volt.svg", renderGirumoSymbolSvg(COLORS.volt));
  await write("svg/girumo-symbol-canvas.svg", renderGirumoSymbolSvg(COLORS.canvas));
  await write("svg/girumo-symbol-black.svg", renderGirumoSymbolSvg(COLORS.black));
  await write("svg/girumo-lockup-horizontal-volt.svg", svgDocument(horizontalVolt.viewBox, horizontalVolt.paths));
  await write("svg/girumo-lockup-horizontal-canvas.svg", svgDocument(horizontalCanvas.viewBox, horizontalCanvas.paths));
  await write("svg/girumo-lockup-stacked-volt.svg", svgDocument(stackedVolt.viewBox, stackedVolt.paths));
  await write("svg/girumo-wordmark-volt.svg", svgDocument(wordmark.viewBox, glyphPaths(wordmark, COLORS.volt)));

  for (const size of PNG_SIZES) {
    let symbolPng = await png(renderGirumoSymbolSvg(COLORS.volt, size));
    if (size === 16 && !(await passageIsOpen(symbolPng))) {
      symbolPng = await png(renderSymbolWithPaths(GIRUMO_MICRO_PATHS, COLORS.volt, size));
      if (!(await passageIsOpen(symbolPng))) {
        throw new Error("The approved 16 px micro geometry did not preserve a one-pixel passage");
      }
    }
    await write(`png/symbol-${size}.png`, symbolPng);
  }

  await write("social/instagram-avatar-1080.png", await png(avatarSvg(COLORS.acid, COLORS.volt)));
  await write("social/instagram-avatar-dark-1080.png", await png(avatarSvg(COLORS.volt, COLORS.canvas)));
  await write("social/og-default-1200x630.png", await png(ogSvg(font, horizontalCanvas)));
  await write("email/girumo-email-lockup-640x160.png", await png(emailSvg(horizontalCanvas)));

  const ico = await pngToIco(
    [16, 32, 48].map((size) => path.join(OUTPUT, "png", `symbol-${size}.png`)),
  );
  await write("favicon.ico", ico);
  await write(path.join("..", "..", "..", "src", "lib", "girumo-wordmark.ts"), generatedWordmarkModule(wordmark));
}

async function main(): Promise<void> {
  const opened = fontkit.openSync(MANROPE_PATH);
  if ("fonts" in opened) throw new Error("Manrope export source must be one font, not a collection");
  if (!/bold|700/i.test(`${opened.subfamilyName} ${opened.postscriptName}`)) {
    throw new Error("Manrope export source must be the static 700/Bold face");
  }
  const outlineFont = opened as unknown as OutlineFont;

  await exportBrand(outlineFont);
  console.log("Exported 19 Girumo public assets and deterministic TypeScript wordmark geometry.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
