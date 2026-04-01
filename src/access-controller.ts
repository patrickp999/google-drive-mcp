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
        fields: "parents",
      });
      const parents: string[] = res.data.parents ?? [];
      if (parents.some((p) => allowedFolderIds.has(p))) {
        return true;
      }
    } catch {
      // If we can't fetch the file, deny access
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
   * Synchronous check — returns true if folderId is in the allowedFolderIds set.
   */
  isFolderAllowed(folderId: string): boolean {
    return this.config.allowedFolderIds.has(folderId);
  }
}
