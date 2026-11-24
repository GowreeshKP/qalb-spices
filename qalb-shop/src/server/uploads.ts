import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "./env";
import { Errors } from "./errors";
import { CONTENT_TYPES, MAX_UPLOAD_BYTES, UPLOAD_NAME, detectImageKind, type ImageKind } from "@/lib/image-type";

export async function saveImage(file: File): Promise<{ url: string }> {
  if (file.size === 0) throw Errors.badRequest("The uploaded file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw Errors.tooLarge("Images must be 2 MB or smaller");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImageKind(bytes);
  if (!kind) throw Errors.unsupportedMedia("Only PNG, JPEG or WebP images are allowed");
  const name = `${randomUUID()}.${kind}`;
  const dir = path.resolve(uploadDir());
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return { url: `/api/uploads/${name}` };
}

export async function readImage(name: string): Promise<{ data: Buffer; contentType: string }> {
  // The strict pattern also rules out path traversal.
  if (!UPLOAD_NAME.test(name)) throw Errors.notFound("Image");
  const kind = name.split(".")[1] as ImageKind;
  try {
    const data = await readFile(path.join(path.resolve(uploadDir()), name));
    return { data, contentType: CONTENT_TYPES[kind] };
  } catch {
    throw Errors.notFound("Image");
  }
}
