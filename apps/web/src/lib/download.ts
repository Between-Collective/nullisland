import { formatBytes, type GeneratedFile, type FilePayload } from "nullisland-core";

/**
 * Saving and copying, which only a browser can do.
 *
 * Everything else about a fixture is computed in `nullisland-core` and works
 * anywhere; these three functions are the reason this file is in the app rather
 * than in the package.
 */

/** Above this, the clipboard is the wrong tool — offer the download instead. */
export const COPY_LIMIT = 2_000_000;

export { formatBytes };

export function downloadFile(file: FilePayload): void {
  const blob =
    typeof file.data === "string"
      ? new Blob([file.data], { type: `${file.mime};charset=utf-8` })
      : new Blob([file.data as BlobPart], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function isCopyable(file: GeneratedFile | null): file is GeneratedFile {
  return !!file && typeof file.data === "string" && file.bytes <= COPY_LIMIT;
}

export async function copyFile(file: GeneratedFile): Promise<boolean> {
  if (typeof file.data !== "string") return false;
  try {
    await navigator.clipboard.writeText(file.data);
    return true;
  } catch {
    return false;
  }
}
