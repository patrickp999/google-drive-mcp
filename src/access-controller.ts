import { drive_v3 } from "googleapis";
import { Config } from "./utils/config.js";

export class AccessController {
  constructor(
    private config: Config,
    private driveClient: drive_v3.Drive,
  ) {}

  /**
   * Returns true if the given file/doc ID is permitted.
   *
   * No-restriction mode: if both allowlists are empty, all access is granted
   * (a startup warning is already logged by loadConfig).
   *
   * Otherwise checks in order:
   *   1. ID is in allowedDocIds → grant
   *   2. Any parent folder is in allowedFolderIds → grant
   *   3. Deny
   */
  async isAllowed(id: string): Promise<boolean> {
    const { allowedDocIds, allowedFolderIds } = this.config;

    // No-restriction mode
    if (allowedDocIds.size === 0 && allowedFolderIds.size === 0) {
      return true;
    }

    // 1. Direct doc ID match
    if (allowedDocIds.has(id)) {
      return true;
    }

    // 2. Parent folder match — fetch parents from Drive API
    try {
      const res = await this.driveClient.files.get({
        fileId: id,
        fields: "id,name,mimeType,parents",
      });
      const parents: string[] = res.data.parents ?? [];
      if (parents.some((p) => allowedFolderIds.has(p))) {
        return true;
      }
    } catch (err) {
      // If we can't fetch the file, log the error and deny access
      console.error(`[AccessController] Drive API error fetching parents for ${id}:`, err);
      return false;
    }

    return false;
  }

  /**
   * Throws an Error if the given ID is not allowed.
   */
  async assertAllowed(id: string): Promise<void> {
    const allowed = await this.isAllowed(id);
    if (!allowed) {
      throw new Error(
        `Access denied: ${id} is not in the allowed folders or document list.`,
      );
    }
  }

  /**
   * Checks access AND verifies the file is a native Google Doc.
   * Throws if access is denied or if the file is not a native Google Doc.
   * Makes a single Drive API call to fetch id, name, mimeType, and parents.
   */
  async assertNativeDoc(id: string): Promise<void> {
    const { allowedDocIds, allowedFolderIds } = this.config;

    // No-restriction mode: skip folder check but still verify MIME type
    const skipFolderCheck = allowedDocIds.size === 0 && allowedFolderIds.size === 0;

    // Direct doc ID match skips folder check
    const directMatch = allowedDocIds.has(id);

    let name: string = id;
    let mimeType: string | undefined;

    if (!skipFolderCheck && !directMatch) {
      // Fetch id, name, mimeType, parents in one call
      try {
        const res = await this.driveClient.files.get({
          fileId: id,
          fields: "id,name,mimeType,parents",
        });
        name = res.data.name ?? id;
        mimeType = res.data.mimeType ?? undefined;
        const parents: string[] = res.data.parents ?? [];

        if (!parents.some((p) => allowedFolderIds.has(p))) {
          throw new Error(
            `Access denied: ${id} is not in the allowed folders or document list.`,
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Access denied")) {
          throw err;
        }
        console.error(`[AccessController] Drive API error for ${id}:`, err);
        throw new Error(
          `Access denied: ${id} is not in the allowed folders or document list.`,
        );
      }
    } else if (!skipFolderCheck && directMatch) {
      // Still need name/mimeType — fetch them
      try {
        const res = await this.driveClient.files.get({
          fileId: id,
          fields: "id,name,mimeType,parents",
        });
        name = res.data.name ?? id;
        mimeType = res.data.mimeType ?? undefined;
      } catch {
        // If we can't fetch metadata, proceed without MIME check
        return;
      }
    } else {
      // No-restriction mode — still fetch MIME type
      try {
        const res = await this.driveClient.files.get({
          fileId: id,
          fields: "id,name,mimeType,parents",
        });
        name = res.data.name ?? id;
        mimeType = res.data.mimeType ?? undefined;
      } catch {
        return;
      }
    }

    if (mimeType !== undefined && mimeType !== "application/vnd.google-apps.document") {
      throw new Error(
        `The file '${name}' (ID: ${id}) is not a native Google Doc. It may be a shortcut or link to a document stored elsewhere in your Drive. To use this file with the MCP server, open it in Google Drive, go to File → Make a copy, and save the copy directly into your MCP Accessible folder. Then use the copied file's ID instead.`,
      );
    }
  }

  /**
   * Synchronous check — returns true if folderId is in the allowedFolderIds set.
   */
  isFolderAllowed(folderId: string): boolean {
    return this.config.allowedFolderIds.has(folderId);
  }
}
