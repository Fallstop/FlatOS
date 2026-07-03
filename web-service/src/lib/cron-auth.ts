import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison of the Authorization header against the expected
 * bearer secret, so the token can't be guessed byte-by-byte via timing.
 */
export function isAuthorizedCronRequest(request: Request, expectedToken: string): boolean {
    const authHeader = request.headers.get("authorization") ?? "";
    const expected = Buffer.from(`Bearer ${expectedToken}`);
    const actual = Buffer.from(authHeader);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
