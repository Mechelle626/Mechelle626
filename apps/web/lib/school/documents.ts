import { message as bcText } from "../i18n/source";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, chmod, writeFile, readFile, unlink } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { AuthError } from "../auth/security";
import { maxDocumentBytes } from "./contracts";
function configuration() {
  const key = Buffer.from(process.env.SCHOOL_DOCUMENT_KEY ?? "", "base64");
  const root = process.env.SCHOOL_DOCUMENT_DIR;
  if (key.length !== 32 || !root || !isAbsolute(root))
    throw new AuthError(
      503,
      bcText("ui.70293d8f90dd6730"),
    );
  return { key, root };
}
export function documentsConfigured() {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}
const safeKey = (value: string) => {
  if (!/^[a-f0-9-]{36}$/i.test(value))
    throw new Error("Invalid private document identifier");
  return `${value}.enc`;
};
export async function validateDocument(bytes: Buffer, declaredType: string) {
  if (bytes.length === 0 || bytes.length > maxDocumentBytes)
    throw new AuthError(
      400,
      bcText("ui.a2eb3629345bbab8"),
    );
  const type = await fileTypeFromBuffer(bytes).catch(() => undefined);
  if (
    !type ||
    !["image/jpeg", "image/png", "application/pdf"].includes(type.mime)
  )
    throw new AuthError(
      400,
      bcText("ui.7c78d79a78151b8b"),
    );
  if (
    declaredType &&
    declaredType !== "application/octet-stream" &&
    declaredType !== type.mime
  )
    throw new AuthError(
      400,
      bcText("ui.15cc503930c1aac0"),
    );
  if (type.mime === "application/pdf")
    return { bytes, mime: "application/pdf" };
  try {
    const image = await sharp(bytes, {
      limitInputPixels: 25000000,
      failOn: "warning",
    })
      .rotate()
      .resize({
        width: 4096,
        height: 4096,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 92 })
      .toBuffer();
    if (image.length > maxDocumentBytes) throw new Error("Image too large");
    return { bytes: image, mime: "image/jpeg" };
  } catch {
    throw new AuthError(
      400,
      bcText("ui.f7c8f6a05dc45a58"),
    );
  }
}
export async function storeDocument(
  keyId: string,
  userId: string,
  requestId: string,
  bytes: Buffer,
) {
  const { key, root } = configuration();
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${userId}:${requestId}`));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  await writeFile(
    join(root, safeKey(keyId)),
    Buffer.concat([Buffer.from("BCS1"), iv, cipher.getAuthTag(), encrypted]),
    { flag: "wx", mode: 0o600 },
  );
}
export async function readDocument(
  keyId: string,
  userId: string,
  requestId: string,
) {
  const { key, root } = configuration(),
    data = await readFile(join(root, safeKey(keyId)));
  if (data.subarray(0, 4).toString() !== "BCS1" || data.length < 32)
    throw new Error("Invalid document envelope");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(4, 16));
  decipher.setAAD(Buffer.from(`${userId}:${requestId}`));
  decipher.setAuthTag(data.subarray(16, 32));
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}
export async function removeDocument(keyId: string) {
  const { root } = configuration();
  await unlink(join(root, safeKey(keyId))).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
export type ScanResult = "clean" | "infected";

export function privateDocumentRoot() {
  return configuration().root;
}
