/**
 * Bug Condition Exploration Tests — Access Control & Resolve Comment
 *
 * Property 1: Bug Condition — Recursive Access Control & Resolve Comment API
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 *
 * These tests encode the EXPECTED (correct) behavior. They will FAIL on
 * unfixed code, confirming the bugs exist. After the fix is implemented,
 * they will PASS.
 *
 * Bug 1: AccessController only checks immediate parents against allowedFolderIds.
 *         Files nested deeper than 1 level are incorrectly denied.
 * Bug 2: resolveComment uses comments.update (which requires content field)
 *         instead of replies.create with { action: "resolve" }.
 */

import { describe, it, expect, vi } from "vitest";
import { AccessController } from "../access-controller.js";
import { resolveComment } from "./resolve-comment.js";
import { drive_v3 } from "googleapis";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT_FOLDER = "root-folder-1";
const SUBFOLDER_A = "subfolder-A";
const FILE_F = "file-F-id-1234567890";
const NATIVE_MIME = "application/vnd.google-apps.document";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an AccessController with a mock driveClient that returns a parent
 * chain: FILE_F → SUBFOLDER_A → ROOT_FOLDER (in allowedFolderIds).
 *
 * The mock files.get responds differently based on the fileId parameter:
 *   - FILE_F      → parents: [SUBFOLDER_A], mimeType: native Google Doc
 *   - SUBFOLDER_A → parents: [ROOT_FOLDER], mimeType: folder
 *   - ROOT_FOLDER → parents: [], mimeType: folder
 */
function makeDepth2AccessController(): {
  accessController: AccessController;
  driveClient: drive_v3.Drive;
} {
  const config = {
    allowedFolderIds: new Set([ROOT_FOLDER]),
    allowedDocIds: new Set<string>(),
    googleClientId: "fake-client-id",
    googleClientSecret: "fake-client-secret",
  };

  const filesGetMock = vi.fn().mockImplementation(({ fileId }: { fileId: string }) => {
    if (fileId === FILE_F) {
      return Promise.resolve({
        data: {
          id: FILE_F,
          name: "File F",
          mimeType: NATIVE_MIME,
          parents: [SUBFOLDER_A],
        },
      });
    }
    if (fileId === SUBFOLDER_A) {
      return Promise.resolve({
        data: {
          id: SUBFOLDER_A,
          name: "Subfolder A",
          mimeType: "application/vnd.google-apps.folder",
          parents: [ROOT_FOLDER],
        },
      });
    }
    if (fileId === ROOT_FOLDER) {
      return Promise.resolve({
        data: {
          id: ROOT_FOLDER,
          name: "Root Folder",
          mimeType: "application/vnd.google-apps.folder",
          parents: [],
        },
      });
    }
    return Promise.reject(new Error(`Unknown fileId: ${fileId}`));
  });

  const driveClient = {
    files: { get: filesGetMock },
  } as unknown as drive_v3.Drive;

  const accessController = new AccessController(config, driveClient);

  return { accessController, driveClient };
}

// ---------------------------------------------------------------------------
// Bug 1 — Access Control (depth > 1)
// Validates: Requirements 1.1, 1.2, 1.3
// ---------------------------------------------------------------------------

describe("Bug 1 — Access Control: depth-2 descendants should be allowed", () => {
  /**
   * Validates: Requirement 1.1
   * isAllowed should return true for a file whose grandparent is an allowed root.
   * On UNFIXED code this returns false because only immediate parents are checked.
   */
  it("isAllowed returns true for file F (depth-2 descendant of allowed root)", async () => {
    const { accessController } = makeDepth2AccessController();
    const result = await accessController.isAllowed(FILE_F);
    expect(result).toBe(true);
  });

  /**
   * Validates: Requirement 1.2
   * isFolderAllowed should return true for subfolder-A which is a direct child
   * of an allowed root. On UNFIXED code this returns false because isFolderAllowed
   * is a flat Set.has() with no parent traversal.
   */
  it("isFolderAllowed returns true for subfolder-A (child of allowed root)", async () => {
    const { accessController } = makeDepth2AccessController();
    // isFolderAllowed is synchronous on unfixed code, may become async after fix
    const result = await Promise.resolve(accessController.isFolderAllowed(SUBFOLDER_A));
    expect(result).toBe(true);
  });

  /**
   * Validates: Requirement 1.3
   * assertNativeDoc should NOT throw for a Google Doc nested 2 levels deep
   * under an allowed root. On UNFIXED code it throws "Access denied" because
   * it only checks immediate parents.
   */
  it("assertNativeDoc does not throw for a Google Doc nested 2 levels deep", async () => {
    const { accessController } = makeDepth2AccessController();
    await expect(accessController.assertNativeDoc(FILE_F)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — Resolve Comment
// Validates: Requirements 1.4, 1.5
// ---------------------------------------------------------------------------

describe("Bug 2 — Resolve Comment: should use replies.create, not comments.update", () => {
  /**
   * Validates: Requirements 1.4, 1.5
   * resolveComment should call replies.create with { action: "resolve" }
   * and should NOT call comments.update or comments.get.
   *
   * On UNFIXED code:
   *   - comments.get IS called (unnecessary pre-check)
   *   - comments.update IS called (wrong endpoint, produces 400)
   *   - replies.create is NOT called
   */
  it("resolveComment calls replies.create with action resolve and does NOT call comments.update or comments.get", async () => {
    // AccessController that allows the document
    const config = {
      allowedFolderIds: new Set(["allowed-folder"]),
      allowedDocIds: new Set<string>(),
      googleClientId: "fake-client-id",
      googleClientSecret: "fake-client-secret",
    };
    const acDriveClient = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: "doc-1",
            name: "Test Doc",
            mimeType: NATIVE_MIME,
            parents: ["allowed-folder"],
          },
        }),
      },
    } as unknown as drive_v3.Drive;
    const accessController = new AccessController(config, acDriveClient);

    // Drive client with spies for the resolve-comment call
    const repliesCreateSpy = vi.fn().mockResolvedValue({ data: { id: "reply-1" } });
    const commentsUpdateSpy = vi.fn().mockResolvedValue({ data: { id: "c1", resolved: true } });
    const commentsGetSpy = vi.fn().mockResolvedValue({ data: { id: "c1", resolved: false } });

    const driveClient = {
      replies: { create: repliesCreateSpy },
      comments: { update: commentsUpdateSpy, get: commentsGetSpy },
    } as unknown as drive_v3.Drive;

    const result = await resolveComment(
      { documentId: "doc-1", commentId: "c1" },
      driveClient,
      accessController
    );

    // Expected behavior: replies.create called with action: "resolve"
    expect(repliesCreateSpy).toHaveBeenCalledTimes(1);
    expect(repliesCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "doc-1",
        commentId: "c1",
        requestBody: expect.objectContaining({ action: "resolve" }),
      })
    );

    // Expected behavior: comments.update and comments.get should NOT be called
    expect(commentsUpdateSpy).not.toHaveBeenCalled();
    expect(commentsGetSpy).not.toHaveBeenCalled();

    // Should succeed
    expect(result.isError).toBe(false);
  });
});
