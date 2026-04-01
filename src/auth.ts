import * as fs from "fs";
import * as http from "http";
import { exec } from "child_process";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import * as os from "os";
import * as path from "path";
import type { Config } from "./utils/config.js";

export const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

const REDIRECT_PORT = 4242;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  expiry_date: number; // Unix ms
  token_type: string;
  scope: string;
}

/** Returns the path where the OAuth token is persisted. */
export function getTokenPath(): string {
  return process.env.TOKEN_PATH ?? path.join(os.homedir(), ".gdrive-mcp-token.json");
}

/** Writes the token as JSON to the token path. */
export function saveToken(token: StoredToken): void {
  fs.writeFileSync(getTokenPath(), JSON.stringify(token, null, 2), "utf-8");
}

/** Reads and parses the token from disk. Returns null if the file does not exist. */
export function loadToken(): StoredToken | null {
  const tokenPath = getTokenPath();
  if (!fs.existsSync(tokenPath)) return null;
  try {
    const raw = fs.readFileSync(tokenPath, "utf-8");
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

/**
 * Starts a temporary local HTTP server on REDIRECT_PORT, opens the OAuth
 * consent URL in the default browser, waits for the callback with the auth
 * code, then shuts the server down and returns the code.
 */
async function runLocalCallbackFlow(auth: OAuth2Client): Promise<void> {
  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    redirect_uri: REDIRECT_URI,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/oauth2callback")) return;

      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      if (authCode) {
        res.end("<h2>Authorization successful — you can close this tab.</h2>");
        server.close();
        resolve(authCode);
      } else {
        res.end(`<h2>Authorization failed: ${error ?? "unknown error"}</h2>`);
        server.close();
        reject(new Error(`OAuth error: ${error ?? "unknown"}`));
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.error(`Opening browser for Google authorization...`);
      console.error(`If the browser does not open, visit:\n${authUrl}`);
      // Open the URL in the default browser
      const cmd =
        process.platform === "darwin"
          ? `open "${authUrl}"`
          : process.platform === "win32"
            ? `start "" "${authUrl}"`
            : `xdg-open "${authUrl}"`;
      exec(cmd);
    });

    server.on("error", reject);
  });

  const { tokens } = await auth.getToken({ code, redirect_uri: REDIRECT_URI });
  auth.setCredentials(tokens);
  saveToken(tokens as StoredToken);
}

/**
 * Returns a fully authenticated OAuth2Client.
 *
 * Lifecycle:
 * 1. Load persisted token from disk.
 * 2. If token exists and is expired (or within 60s of expiry), refresh it.
 *    On refresh failure, fall back to the local callback re-auth flow.
 * 3. If no token exists, run the local callback auth flow.
 */
export async function getAuthClient(config: Config): Promise<OAuth2Client> {
  const auth = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    REDIRECT_URI,
  );

  const stored = loadToken();

  if (stored) {
    auth.setCredentials(stored);

    const nowMs = Date.now();
    const expiryMs = stored.expiry_date ?? 0;
    const isExpiredOrSoon = expiryMs - nowMs <= 60_000;

    if (isExpiredOrSoon) {
      try {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);
        saveToken(credentials as StoredToken);
      } catch (err) {
        console.error("Token refresh failed, re-authorizing:", (err as Error).message);
        await runLocalCallbackFlow(auth);
      }
    }
  } else {
    await runLocalCallbackFlow(auth);
  }

  return auth;
}
