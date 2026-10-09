import { z } from 'zod';

// POST /uploads/image — multipart/form-data with the file in field UPLOAD_IMAGE_FIELD.
// The server re-encodes to WebP and stores it under a random name.
export const UploadImageResponseSchema = z.object({ url: z.url() });
export type UploadImageResponse = z.infer<typeof UploadImageResponseSchema>;
