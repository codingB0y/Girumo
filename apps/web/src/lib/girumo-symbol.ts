export const GIRUMO_VIEWBOX = "0 0 24 24";
export const GIRUMO_PATHS = [
  "M5 2H12V10H9V22H5A3 3 0 0 1 2 19V5A3 3 0 0 1 5 2Z",
  "M14 2H19A3 3 0 0 1 22 5V19A3 3 0 0 1 19 22H11V14H14V2Z",
] as const;

export const GIRUMO_MICRO_PATHS = [
  "M5 2H11.75V10H8.75V22H5A3 3 0 0 1 2 19V5A3 3 0 0 1 5 2Z",
  "M14.25 2H19A3 3 0 0 1 22 5V19A3 3 0 0 1 19 22H11.25V14H14.25V2Z",
] as const;

export function renderGirumoSymbolSvg(color = "#071923", size = 24): string {
  const paths = GIRUMO_PATHS.map((d) => `<path fill="${color}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GIRUMO_VIEWBOX}" width="${size}" height="${size}" aria-hidden="true">${paths}</svg>`;
}
