export interface Config {
  googleClientId: string;
  googleClientSecret: string;
  allowedFolderIds: Set<string>;
  allowedDocIds: Set<string>;
}

/**
 * Splits a comma-separated string of IDs, trims whitespace, and filters empty entries.
 * Returns an empty Set for undefined/empty input.
 */
export function parseIdList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Reads all required env vars and returns a Config object.
 * Exits the process if GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET are missing.
 * Logs a startup warning when both allowlists are empty (no restriction mode).
 */
export function loadConfig(): Config {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");

  if (missing.length > 0) {
    for (const name of missing) {
      console.error(`Missing required environment variable: ${name}`);
    }
    process.exit(1);
  }

  const allowedFolderIds = parseIdList(process.env.ALLOWED_FOLDER_IDS);
  const allowedDocIds = parseIdList(process.env.ALLOWED_DOC_IDS);

  if (allowedFolderIds.size === 0 && allowedDocIds.size === 0) {
    console.warn(
      "Warning: No access restrictions configured (ALLOWED_FOLDER_IDS and ALLOWED_DOC_IDS are both empty)",
    );
  }

  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID!,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    allowedFolderIds,
    allowedDocIds,
  };
}
