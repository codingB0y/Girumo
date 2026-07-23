export const POST_FORMATS = Object.freeze({
  square: Object.freeze({ width: 1080, height: 1080 }),
  portrait: Object.freeze({ width: 1080, height: 1350 }),
  story: Object.freeze({ width: 1080, height: 1920 }),
  videoCover: Object.freeze({ width: 1920, height: 1080 }),
} as const);

export type PostFormatKey = keyof typeof POST_FORMATS;
export type PostFormat = (typeof POST_FORMATS)[PostFormatKey];

export const DEFAULT_POST_FORMAT: PostFormatKey = "portrait";

function isPostFormatKey(value: string): value is PostFormatKey {
  return Object.prototype.hasOwnProperty.call(POST_FORMATS, value);
}

export function resolvePostFormat(value?: string | null): PostFormat & { key: PostFormatKey } {
  const key = value && isPostFormatKey(value) ? value : DEFAULT_POST_FORMAT;
  return { key, ...POST_FORMATS[key] };
}
