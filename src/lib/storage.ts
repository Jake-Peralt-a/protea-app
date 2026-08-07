import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";

// Identity documents must never be web-public; they are readable only through an
// admin-authenticated route (FR-13, NFR-security). The storage backend is pluggable
// so production can swap the local driver for S3 without touching call sites.

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface StorageDriver {
  /** Persist bytes and return an opaque storage key. */
  put(bytes: Uint8Array, contentType: string, ext: string): Promise<string>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function extForMime(mime: string): string {
  return EXT_BY_TYPE[mime] ?? "bin";
}

// --- Local filesystem driver (default) --------------------------------------
// Files live under a non-public directory (default `.storage`), keyed by a random
// UUID so keys are unguessable. The content type is stored in a sidecar file.
class LocalStorageDriver implements StorageDriver {
  private baseDir = path.resolve(process.cwd(), config.storage.localDir);

  private async ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async put(bytes: Uint8Array, contentType: string, ext: string): Promise<string> {
    await this.ensureDir();
    const key = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(this.baseDir, key), bytes);
    await fs.writeFile(path.join(this.baseDir, `${key}.type`), contentType, "utf8");
    return key;
  }

  async get(key: string): Promise<StoredObject> {
    // Guard against path traversal — keys are single path segments only.
    if (key.includes("/") || key.includes("..") || key.includes("\\")) {
      throw new Error("Invalid storage key");
    }
    const bytes = await fs.readFile(path.join(this.baseDir, key));
    let contentType = "application/octet-stream";
    try {
      contentType = await fs.readFile(
        path.join(this.baseDir, `${key}.type`),
        "utf8",
      );
    } catch {
      // sidecar missing — fall back to octet-stream
    }
    return { bytes: new Uint8Array(bytes), contentType };
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.baseDir, key), { force: true });
    await fs.rm(path.join(this.baseDir, `${key}.type`), { force: true });
  }
}

// --- S3 driver (production seam) --------------------------------------------
// Implement this against @aws-sdk/client-s3 (install it and set STORAGE_DRIVER=s3).
// It must satisfy the same StorageDriver interface; documents should be served with
// short-lived presigned GET URLs restricted to authenticated administrators.
class S3StorageDriver implements StorageDriver {
  private unavailable(): never {
    throw new Error(
      "S3 storage driver is not configured. Install @aws-sdk/client-s3, set the S3_* " +
        "environment variables, and implement S3StorageDriver, or use STORAGE_DRIVER=local.",
    );
  }
  put() {
    return this.unavailable();
  }
  get() {
    return this.unavailable();
  }
  delete() {
    return this.unavailable();
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver =
    config.storage.driver === "s3"
      ? new S3StorageDriver()
      : new LocalStorageDriver();
  return driver;
}
