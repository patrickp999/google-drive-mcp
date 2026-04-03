/**
 * Property 2: Preservation — Bugfix Preservation Tests
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 *
 * These tests capture EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on the current unfixed code.
 *
 * Observation-first methodology:
 *   On UNFIXED code, we observe the behavior for inputs where the bug
 *   condition does NOT hold, then write property-based tests asserting
 *   those behaviors are preserved.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { replyToComment } from "./reply-to-comment.js";
import { drive_v3 } from "googleapis";

// ---------------------------------------------------------------------------
// Constants & Arbitraries
// ---------------------------------------------------------------------------

const NATIVE_MIME = "application/vnd.google-apps.document";
const ALLOWED_FOLDER = "allowed-folder-root";

/** Generates plausible IDs (alphanumeric, 10-44 chars). */
const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);

// ---------------------------------------------------------------------------
// Preservation 1: Direct child preservation
// Validates: Requirement 3.1
// ---------------------------------------------------------------------------

describe("Preservation — Direct child of allowed folder is allowed", () => {
  it("isAllowed returns true for any file whose immediate parent is in allowedFolderIds", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const config = {
          allowedFolderIds: new Set([ALLOWED_FOLDER]),
          allowedDocIds: new Set<string>(),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        const driveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: {
                id: fileId,
                name: "Test File",
                mimeType: NATIVE_MIME,
                parents: [ALLOWED_FOLDER],
              },
            }),
          },
        } as unknown as drive_v3.Drive;

        const ac = new AccessController(config, driveClient);
        const result = await ac.isAllowed(fileId);
        expect(result).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});


// ---------------------------------------------------------------------------
// Preservation 2: Doc ID bypass preservation
// Validates: Requirement 3.2
// ---------------------------------------------------------------------------

describe("Preservation — Doc ID bypass grants access regardless of parents", () => {
  it("isAllowed returns true for any file ID in allowedDocIds", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (docId) => {
        const config = {
          allowedFolderIds: new Set([ALLOWED_FOLDER]),
          allowedDocIds: new Set([docId]),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        // Drive client should NOT be called for doc ID bypass
        const filesGetMock = vi.fn();
        const driveClient = {
          files: { get: filesGetMock },
        } as unknown as drive_v3.Drive;

        const ac = new AccessController(config, driveClient);
        const result = await ac.isAllowed(docId);
        expect(result).toBe(true);
        // Doc ID bypass should not need a Drive API call
        expect(filesGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation 3: No-restriction mode preservation
// Validates: Requirement 3.3
// ---------------------------------------------------------------------------

describe("Preservation — No-restriction mode allows all access", () => {
  it("isAllowed returns true for any ID when both allowlists are empty", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const config = {
          allowedFolderIds: new Set<string>(),
          allowedDocIds: new Set<string>(),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        const filesGetMock = vi.fn();
        const driveClient = {
          files: { get: filesGetMock },
        } as unknown as drive_v3.Drive;

        const ac = new AccessController(config, driveClient);
        const result = await ac.isAllowed(fileId);
        expect(result).toBe(true);
        // No-restriction mode should not make any API calls
        expect(filesGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation 4: Deny preservation
// Validates: Requirements 3.4, 3.5
// ---------------------------------------------------------------------------

describe("Preservation — Deny when parent chain never reaches allowed folder", () => {
  it("isAllowed returns false when parents do not include any allowed folder", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, idArb, async (fileId, unrelatedParent) => {
        // Ensure the unrelated parent is NOT the allowed folder
        fc.pre(unrelatedParent !== ALLOWED_FOLDER);

        const config = {
          allowedFolderIds: new Set([ALLOWED_FOLDER]),
          allowedDocIds: new Set<string>(),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        const driveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: {
                id: fileId,
                name: "Unrelated File",
                mimeType: NATIVE_MIME,
                parents: [unrelatedParent],
              },
            }),
          },
        } as unknown as drive_v3.Drive;

        const ac = new AccessController(config, driveClient);
        const result = await ac.isAllowed(fileId);
        expect(result).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation 5: Fail-closed preservation
// Validates: Requirement 3.5
// ---------------------------------------------------------------------------

describe("Preservation — Fail-closed on Drive API error", () => {
  it("isAllowed returns false when Drive API throws during parent fetch", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const config = {
          allowedFolderIds: new Set([ALLOWED_FOLDER]),
          allowedDocIds: new Set<string>(),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        const driveClient = {
          files: {
            get: vi.fn().mockRejectedValue(new Error("Drive API unavailable")),
          },
        } as unknown as drive_v3.Drive;

        const ac = new AccessController(config, driveClient);
        const result = await ac.isAllowed(fileId);
        expect(result).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});


// ---------------------------------------------------------------------------
// Preservation 6: reply_to_comment uses replies.create with { content }
// Validates: Requirement 3.6
// ---------------------------------------------------------------------------

describe("Preservation — reply_to_comment calls replies.create with { content }", () => {
  it("reply_to_comment uses replies.create with content (not action)", async () => {
    const contentArb = fc.string({ minLength: 1, maxLength: 100 });

    await fc.assert(
      fc.asyncProperty(idArb, idArb, contentArb, async (docId, commentId, content) => {
        // AccessController that allows the document (direct child of allowed folder)
        const config = {
          allowedFolderIds: new Set([ALLOWED_FOLDER]),
          allowedDocIds: new Set<string>(),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        const acDriveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: {
                id: docId,
                name: "Test Doc",
                mimeType: NATIVE_MIME,
                parents: [ALLOWED_FOLDER],
              },
            }),
          },
        } as unknown as drive_v3.Drive;
        const accessController = new AccessController(config, acDriveClient);

        // Drive client with replies.create spy
        const repliesCreateSpy = vi.fn().mockResolvedValue({ data: { id: "reply-1" } });
        const driveClient = {
          replies: { create: repliesCreateSpy },
        } as unknown as drive_v3.Drive;

        const result = await replyToComment(
          { documentId: docId, commentId, content },
          driveClient,
          accessController,
        );

        expect(result.isError).toBe(false);
        expect(repliesCreateSpy).toHaveBeenCalledTimes(1);
        expect(repliesCreateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.objectContaining({ content }),
          }),
        );
        // Ensure it does NOT pass action (that's for resolve)
        const callArgs = repliesCreateSpy.mock.calls[0][0];
        expect(callArgs.requestBody).not.toHaveProperty("action");
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation 7: assertNativeDoc MIME rejection
// Validates: Requirement 3.7
// ---------------------------------------------------------------------------

describe("Preservation — assertNativeDoc throws for non-Google-Doc MIME types", () => {
  it("assertNativeDoc throws for non-native MIME types", async () => {
    const nonNativeMimes = [
      "application/pdf",
      "application/vnd.google-apps.spreadsheet",
      "application/vnd.google-apps.presentation",
      "text/plain",
      "image/png",
      "application/vnd.google-apps.folder",
    ];

    for (const mimeType of nonNativeMimes) {
      const config = {
        allowedFolderIds: new Set([ALLOWED_FOLDER]),
        allowedDocIds: new Set<string>(),
        googleClientId: "fake",
        googleClientSecret: "fake",
      };
      const driveClient = {
        files: {
          get: vi.fn().mockResolvedValue({
            data: {
              id: "some-file-id",
              name: "Not A Doc",
              mimeType,
              parents: [ALLOWED_FOLDER],
            },
          }),
        },
      } as unknown as drive_v3.Drive;

      const ac = new AccessController(config, driveClient);
      await expect(ac.assertNativeDoc("some-file-id")).rejects.toThrow(
        /not a native Google Doc/,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Preservation 8: isFolderAllowed direct match
// Validates: Requirement 3.8
// ---------------------------------------------------------------------------

describe("Preservation — isFolderAllowed returns true for direct matches", () => {
  it("isFolderAllowed returns true for folder IDs directly in allowedFolderIds", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (folderId) => {
        const config = {
          allowedFolderIds: new Set([folderId]),
          allowedDocIds: new Set<string>(),
          googleClientId: "fake",
          googleClientSecret: "fake",
        };
        const driveClient = {
          files: { get: vi.fn() },
        } as unknown as drive_v3.Drive;

        const ac = new AccessController(config, driveClient);
        // isFolderAllowed is synchronous on unfixed code
        const result = await Promise.resolve(ac.isFolderAllowed(folderId));
        expect(result).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});
