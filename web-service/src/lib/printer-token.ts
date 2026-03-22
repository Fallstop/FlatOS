import { createHash } from "crypto";

/**
 * Derive the printer authentication token from CRON_SECRET.
 * This avoids needing a separate env var — the token is deterministic
 * but distinct from CRON_SECRET itself.
 */
export function getPrinterToken(): string | null {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return null;

    return createHash("sha256")
        .update(`printer:${cronSecret}`)
        .digest("hex")
        .slice(0, 32);
}
