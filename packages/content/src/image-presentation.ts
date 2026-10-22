import { z } from "zod";
import { publicImageUrl } from "./image-presentation-runtime";
export { imagePresentation, responsiveImageVariants } from "./image-presentation-runtime";

export const focalPointSchema = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
export type FocalPoint = z.infer<typeof focalPointSchema>;

const imageUrl = z.string().max(2048).refine(publicImageUrl, "Expected a public HTTPS image URL");

export const imageVariantSchema = z.object({
  url: imageUrl,
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
}).strict();
export type ImageVariant = z.infer<typeof imageVariantSchema>;
export const imageVariantsSchema = z.array(imageVariantSchema).max(6);
