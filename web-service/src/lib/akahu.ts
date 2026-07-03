import { AkahuClient } from "akahu";

let client: AkahuClient | null = null;

/**
 * Lazily construct the Akahu client so the app can boot (and pages that don't
 * touch banking can render) even before Akahu credentials are configured.
 * Only sync operations fail, with a clear message.
 */
function getClient(): AkahuClient {
    if (!client) {
        const appToken = process.env.AKAHU_APP_TOKEN;
        if (!appToken) {
            throw new Error("AKAHU_APP_TOKEN is not set");
        }
        client = new AkahuClient({ appToken });
    }
    return client;
}

export const akahu = {
    get accounts() {
        return getClient().accounts;
    },
};

export function getUserToken(): string {
    const token = process.env.AKAHU_API_KEY;
    if (!token) {
        throw new Error("AKAHU_API_KEY (user token) is not set");
    }
    return token;
}

export function getAccountId(): string {
    const accountId = process.env.AKAHU_ACCOUNT_ID;
    if (!accountId) {
        throw new Error("AKAHU_ACCOUNT_ID is not set");
    }
    return accountId;
}
