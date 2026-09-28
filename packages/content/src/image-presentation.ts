import { z } from "zod";

export const focalPointSchema = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
export type FocalPoint = z.infer<typeof focalPointSchema>;

const imageUrl = z.string().max(2048).refine(value => {
  if (value.startsWith("/media/news/") && !value.includes("..") && !value.includes("\\") && !value.includes("?") && !value.includes("#")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && !/[\s,]/.test(value) && !url.pathname.includes("/storage/v1/object/sign/")
      && !url.pathname.includes("/livepoint-submissions/");
  } catch { return false; }
}, "Expected a public HTTPS image URL");

export const imageVariantSchema = z.object({
  url: imageUrl,
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
}).strict();
export type ImageVariant = z.infer<typeof imageVariantSchema>;
export const imageVariantsSchema = z.array(imageVariantSchema).max(6);

/** Only equal-composition images may share a width-descriptor srcset. */
export function responsiveImageVariants(input: unknown, original: { url: string; width: number | null; height: number | null }): ImageVariant[] {
  const parsed = imageVariantsSchema.safeParse(input);
  if (!parsed.success || !original.width || !original.height) return [];
  const ratio = original.width / original.height;
  const byWidth = new Map<number, ImageVariant>();
  for (const variant of parsed.data) {
    if (variant.width <= original.width && variant.height <= original.height
      && Math.abs(variant.width / variant.height / ratio - 1) <= 0.01) byWidth.set(variant.width, variant);
  }
  if (!byWidth.size) return [];
  const source = imageVariantSchema.safeParse({ url: original.url, width: original.width, height: original.height });
  if (source.success) byWidth.set(source.data.width, source.data);
  return [...byWidth.values()].sort((a, b) => a.width - b.width);
}

export function imagePresentation(input: { url: string; width: number | null; height: number | null; variants?: unknown; focalPoint?: unknown }) {
  const variants = responsiveImageVariants(input.variants, input);
  const focal = focalPointSchema.safeParse(input.focalPoint);
  return {
    srcSet: variants.length > 1 ? variants.map(variant => `${variant.url} ${variant.width}w`).join(", ") : undefined,
    objectPosition: focal.success ? `${focal.data.x * 100}% ${focal.data.y * 100}%` : undefined,
  };
}
