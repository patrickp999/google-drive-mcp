import { drive_v3 } from "googleapis";
import { Config } from "./utils/config.js";

export class AccessController {
  /** Cache: folder/file ID → whether it's under an allowed root */
  private traversalCache = new Map<string, boolean>();

  constructor(
    private config: Config,
    private driveClient: drive_v3.Drive,
  ) {}

  /**
   * Returns true if the given file/doc ID is permitted.
   *
   * No-restriction mode: if both allowlists are empty, all access is granted.
   *
   * Otherwise checks in order:
   *   1. ID is in allowedDocIds → grant
   *   2. ID is in allowedFolderIds → grant
   *   3. Recursive parent traversal — walk up the parent chain via Drive API
   *      until an allowed folder is found or the chain is exhausted
   *   4. Deny
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

    // 2. Direct folder ID match
    if (allowedFolderIds.has(id)) {
      return true;
    }

    // 3. Recursive parent traversal
    return this.isDescendantOfAllowed(id);
  }

  /**
   * Walks the parent chain of `id` via Drive API until an allowed folder
   * is found or the chain is exhausted. Uses a visited set to prevent
   * infinite loops and an instance-level cache to avoid redundant API calls.
   */
  private async isDescendantOfAllowed(id: string): Promise<boolean> {
    const { allowedFolderIds } = this.config;
    const visited = new Set<string>();
    const toCheck: string[] = [id];

    while (toCheck.length > 0) {
      const current = toCheck.pop()!;

      if (visited.has(current)) continue;
      visited.add(current);

      // Check cache
      if (this.traversalCache.has(current)) {
        const cached = this.traversalCache.get(current)!;
        if (cached) return true;
        continue; // cached as denied — skip but keep checking other branches
      }

      // Direct match on allowed folders
      if (allowedFolderIds.has(current)) {
        // Cache all visited nodes as allowed
        for (const v of visited) {
          this.traversalCache.set(v, true);
        }
        return true;
      }

      // Fetch parents from Drive API
      try {
        const res = await this.driveClient.files.get({
          fileId: current,
          fields: "parents",
        });
        const parents: string[] = res.data.parents ?? [];

        if (parents.length === 0) {
          // Reached root with no match — cache this node as denied
          this.traversalCache.set(current, false);
          continue;
        }

        for (const parent of parents) {
          if (!visited.has(parent)) {
            toCheck.push(parent);
          }
        }
      } catch (err) {
        console.error(`[AccessController] Drive API error fetching parents for ${current}:`, err);
        this.traversalCache.set(current, false);
        continue;
      }
    }

    // Exhausted chain without finding an allowed folder — cache all as denied
    for (const v of visited) {
      if (!this.traversalCache.has(v)) {
        this.traversalCache.set(v, false);
      }
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
   * Delegates access check to isAllowed (recursive traversal),
   * then verifies MIME type separately.
   */
  async assertNativeDoc(id: string): Promise<void> {
    // Access check via recursive isAllowed
    await this.assertAllowed(id);

    // MIME type check — fetch file metadata
    let name: string = id;
    let mimeType: string | undefined;

    try {
      const res = await this.driveClient.files.get({
        fileId: id,
        fields: "id,name,mimeType",
      });
      name = res.data.name ?? id;
      mimeType = res.data.mimeType ?? undefined;
    } catch {
      // If we can't fetch metadata, skip MIME check (access already validated)
      return;
    }

    if (mimeType !== undefined && mimeType !== "application/vnd.google-apps.document") {
      throw new Error(
        `The file '${name}' (ID: ${id}) is not a native Google Doc. It may be a shortcut or link to a document stored elsewhere in your Drive. To use this file with the MCP server, open it in Google Drive, go to File → Make a copy, and save the copy directly into your MCP Accessible folder. Then use the copied file's ID instead.`,
      );
    }
  }

  /**
   * Async check — returns true if folderId is in allowedFolderIds or is a
   * descendant of an allowed folder via recursive parent traversal.
   */
  async isFolderAllowed(folderId: string): Promise<boolean> {
    const { allowedFolderIds } = this.config;

    // Direct match — fast path
    if (allowedFolderIds.has(folderId)) {
      return true;
    }

    // Recursive parent traversal
    return this.isDescendantOfAllowed(folderId);
  }
}
