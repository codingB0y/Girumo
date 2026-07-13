import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const layout = readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf8");

function readSource(...segments: string[]) {
  return readFileSync(path.join(process.cwd(), "src", ...segments), "utf8");
}

function readCssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "i"));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("defines the Volt Commerce token contract", () => {
  for (const value of ["#071923", "#0C2835", "#123746", "#A7FF2F", "#2E66FF", "#F4F0E7", "#1947C9"]) {
    assert.match(css.toUpperCase(), new RegExp(value.toUpperCase()));
  }
});

test("defines Girumo layout, type, control, icon, and motion contracts", () => {
  for (const value of ["--space-unit: 4px", "--content-max: 1200px", "--reading-min: 640px", "--reading-max: 720px", "--radius-control: 8px", "--radius-card: 12px", "--radius-panel: 16px", "--control-height: 40px", "--control-height-prominent: 48px", "--icon-stroke: 1.75", "--duration-micro: 180ms", "--duration-page: 280ms", "--ease-girumo: cubic-bezier(0.22, 1, 0.36, 1)"]) {
    assert.match(css, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("defines the complete Girumo palette and font aliases", () => {
  for (const value of [
    "--color-volt-950: #071923",
    "--color-volt-900: #0C2835",
    "--color-volt-800: #123746",
    "--color-acid-500: #A7FF2F",
    "--color-cobalt-500: #2E66FF",
    "--color-cobalt-700: #1947C9",
    "--color-canvas-100: #F4F0E7",
    "--color-paper-0: #FFFEFA",
    "--color-slate-600: #52646C",
    "--color-line-200: #D8D7CF",
    "--color-success-700: #0C7346",
    "--color-warning-700: #7A4A00",
    "--color-danger-700: #B82936",
    "--color-info-700: #1947C9",
    "--font-brand: var(--font-manrope), sans-serif",
    "--font-body: var(--font-plex-sans), sans-serif",
    "--font-data: var(--font-plex-mono), monospace",
  ]) {
    assert.match(css.toUpperCase(), new RegExp(value.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("defines the named Girumo typography scale", () => {
  const contracts = [
    ["type-display-xl", "64px", "64px"],
    ["type-display-l", "48px", "52px"],
    ["type-h1", "32px", "38px"],
    ["type-h2", "24px", "30px"],
    ["type-h3", "20px", "26px"],
    ["type-body-l", "18px", "28px"],
    ["type-body-m", "16px", "24px"],
    ["type-body-s", "14px", "20px"],
    ["type-label", "12px", "16px"],
    ["type-data", "12px", "16px"],
  ];

  for (const [className, fontSize, lineHeight] of contracts) {
    assert.match(
      css,
      new RegExp(`\\.${className}\\s*\\{[^}]*font-size:\\s*${fontSize};[^}]*line-height:\\s*${lineHeight};`),
    );
  }

  assert.match(css, /\.type-display-xl\s*{[^}]*font-size:\s*44px;[^}]*line-height:\s*46px;/);
  assert.match(css, /\.type-display-l\s*{[^}]*font-size:\s*36px;[^}]*line-height:\s*40px;/);
  assert.match(css, /\.type-h2\s*{[^}]*font-weight:\s*650;/);
  assert.match(css, /\.type-h3\s*{[^}]*font-weight:\s*650;/);
  assert.match(css, /\.type-label\s*{[^}]*font-weight:\s*600;/);
  assert.match(css, /\.type-data\s*{[^}]*font-family:\s*var\(--font-data\);[^}]*font-weight:\s*500;/);
});

test("uses the three Girumo root fonts only", () => {
  assert.match(layout, /Manrope/);
  assert.match(layout, /IBM_Plex_Sans/);
  assert.match(layout, /IBM_Plex_Mono/);
  assert.match(layout, /className=\{`\$\{manrope\.variable\} \$\{plexSans\.variable\} \$\{plexMono\.variable\}`\}/);
  assert.doesNotMatch(layout, /Bricolage|Instrument|Space_Grotesk|font-space|font-instrument|font-bricolage/);
});

test("applies Girumo control contracts to shared primitives", () => {
  const button = readSource("components", "ui", "button.tsx");
  const input = readSource("components", "ui", "input.tsx");
  const card = readSource("components", "ui", "card.tsx");
  const badge = readSource("components", "ui", "badge.tsx");
  const skeleton = readSource("components", "ui", "skeleton.tsx");
  const emptyState = readSource("components", "painel", "empty-state.tsx");

  assert.match(button, /primary:\s*"bg-acid-500 text-volt-950 shadow-sm hover:brightness-95 active:brightness-90"/);
  assert.match(button, /focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500/);
  assert.match(button, /var\(--control-height-prominent\)/);
  assert.match(input, /var\(--control-height\)/);
  assert.match(input, /cobalt-500/);
  assert.match(card, /var\(--radius-card\)/);
  assert.match(emptyState, /var\(--radius-panel\)/);
  assert.match(emptyState, /var\(--icon-stroke\)/);

  for (const source of [button, input, card, badge, skeleton, emptyState]) {
    assert.doesNotMatch(source, /rgba\(106,\s*75,\s*240|#(?:7c5cff|6a4bf0|8a6cff|3d1fb0|3d5af1)/i);
  }
});

test("uses Acid selection and honors reduced motion", () => {
  assert.match(css, /::selection\s*{[^}]*background:\s*var\(--color-acid-500\);[^}]*color:\s*var\(--color-volt-950\);/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transition-duration:\s*1ms\s*!important/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-iteration-count:\s*1\s*!important/);
  assert.doesNotMatch(css, /eclipse|shimmer/i);
});

test("preserves pn-aurora consumers with a solid, high-contrast Volt surface", () => {
  const surface = readCssRule(".pn-aurora");

  assert.match(surface, /background:\s*var\(--color-volt-950\);/);
  assert.match(surface, /color:\s*var\(--color-paper-0\);/);
  assert.doesNotMatch(surface, /gradient|backdrop-filter|animation/i);
});

test("uses opaque global navigation surfaces", () => {
  const scrolledNav = readCssRule(".lp-nav-scrolled .lp-nav-inner");

  assert.match(scrolledNav, /background:\s*var\(--color-volt-950\);/);
  assert.doesNotMatch(css, /backdrop-filter/i);
});

test("removes the legacy lp button sweep", () => {
  assert.doesNotMatch(css, /@keyframes\s+lp-shine|\.lp-btn::after|\.lp-btn:hover::after/i);
});

test("uses a flat showcase card surface", () => {
  const showcase = readCssRule(".lp-ring-soft");

  assert.match(showcase, /background:\s*var\(--color-volt-900\);/);
  assert.match(showcase, /border-color:\s*var\(--color-cobalt-500\);/);
  assert.doesNotMatch(showcase, /gradient|backdrop-filter/i);
});

test("removes the purple HubFlow palette", () => {
  const normalized = css.replace(/\s+/g, "").toUpperCase();
  for (const value of ["#7C5CFF", "#6A4BF0", "#8A6CFF", "#3D1FB0", "#A78CFF", "#3D5AF1", "#9A82FF", "#B9ABFF", "#6A45F0", "#5836C9", "#46299E", "#F3F1FF", "#E9E5FF", "#D6CEFF", "rgba(106,75,240", "rgba(88,54,201"]) {
    assert.equal(normalized.includes(value.toUpperCase()), false, value);
  }
});
