// Centralised, typed access to environment configuration.
// Values are read lazily so pure modules that import this file can still be unit
// tested without a full environment.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  get appUrl() {
    return optional("APP_URL", "http://localhost:3000");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  storage: {
    get driver() {
      return optional("STORAGE_DRIVER", "local");
    },
    get localDir() {
      return optional("STORAGE_LOCAL_DIR", ".storage");
    },
  },
  uploads: {
    get maxBytes() {
      return Number(optional("MAX_UPLOAD_BYTES", "10485760"));
    },
    get allowedTypes() {
      return optional(
        "ALLOWED_UPLOAD_TYPES",
        "image/png,image/jpeg,image/webp,application/pdf",
      )
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    },
  },
  get retentionDays() {
    return Number(optional("DOCUMENT_RETENTION_DAYS", "365"));
  },
  email: {
    get driver() {
      return optional("EMAIL_DRIVER", "log");
    },
    get from() {
      return optional("EMAIL_FROM", "no-reply@futureprotea.example");
    },
  },
} as const;
