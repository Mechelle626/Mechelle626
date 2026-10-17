import { message as bcText } from "../i18n/source";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { AuthError } from "../auth/security";
import { privateDocumentRoot, type ScanResult } from "./documents";
export async function scanWithClamAV(bytes: Buffer): Promise<ScanResult> {
  const root = privateDocumentRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(join(root, ".scan-"));
  const path = join(folder, "document");
  try {
    await writeFile(path, bytes, { mode: 0o600 });
    return await new Promise<ScanResult>((resolve, reject) => {
      execFile(
        process.env.SCHOOL_SCANNER_EXECUTABLE?.trim() || "clamscan",
        ["--no-summary", "--infected", path],
        { timeout: 60000, maxBuffer: 65536 },
        (error) => {
          if (!error) resolve("clean");
          else if ((error as { code?: number | string }).code === 1)
            resolve("infected");
          else
            reject(
              new AuthError(
                503,
                bcText("ui.963bdffb78ff6102"),
              ),
            );
        },
      );
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
