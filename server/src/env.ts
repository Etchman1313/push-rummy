const DEFAULT_JWT_SECRET = "push-rummy-dev-secret";

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === DEFAULT_JWT_SECRET) {
    throw new Error(
      "Production requires JWT_SECRET: set a unique random string of at least 32 characters (e.g. openssl rand -base64 48)"
    );
  }
}

/** Origins for Express CORS + Socket.IO; empty array means allow any (`*`). */
export function configuredCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminResetConfigured(): boolean {
  const k = process.env.ADMIN_RESET_KEY;
  return typeof k === "string" && k.length > 0;
}
