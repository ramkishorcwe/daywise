import { z } from 'zod';
import { providerPlaceId } from './locations';

export const placePhotoRequestSchema = z.strictObject({ placeId: providerPlaceId.max(1000) });
export const placePhotoSchema = z.strictObject({
  photo: z.strictObject({
    uri: z.url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')); }),
    authors: z.array(z.strictObject({ name: z.string().min(1).max(300), uri: z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol)).nullable() })).max(20),
  }).nullable(),
});
export type PlacePhoto = z.infer<typeof placePhotoSchema>;
