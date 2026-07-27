export const GIRUMO_VIEWBOX = "0 0 24 24";
export const GIRUMO_PATHS = [
  "M5 2H12V10H9V22H5A3 3 0 0 1 2 19V5A3 3 0 0 1 5 2Z",
  "M14 2H19A3 3 0 0 1 22 5V19A3 3 0 0 1 19 22H11V14H14V2Z",
] as const;

export const GIRUMO_MICRO_PATHS = [
  "M5 2H11.75V10H8.75V22H5A3 3 0 0 1 2 19V5A3 3 0 0 1 5 2Z",
  "M14.25 2H19A3 3 0 0 1 22 5V19A3 3 0 0 1 19 22H11.25V14H14.25V2Z",
] as const;

export type GirumoAlphaRaster = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
  alphaChannel?: number;
}>;

export function hasOpenGirumoPassage(raster: GirumoAlphaRaster): boolean {
  const alphaChannel = raster.alphaChannel ?? raster.channels - 1;
  let relevantRows = 0;
  for (let y = 0; y < raster.height; y += 1) {
    const row = Array.from(
      { length: raster.width },
      (_, x) => raster.data[(y * raster.width + x) * raster.channels + alphaChannel],
    );
    const occupied = row.flatMap((alpha, x) => (alpha >= 128 ? [x] : []));
    if (occupied.length < 2) continue;
    relevantRows += 1;
    if (!row.slice(Math.min(...occupied) + 1, Math.max(...occupied)).includes(0)) return false;
  }
  return relevantRows > 0;
}

export function renderGirumoSymbolSvg(color = "#071923", size = 24): string {
  const paths = GIRUMO_PATHS.map((d) => `<path fill="${color}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GIRUMO_VIEWBOX}" width="${size}" height="${size}" aria-hidden="true">${paths}</svg>`;
}
