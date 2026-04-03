/**
 * Feature: google-drive-mcp-v2
 * Property tests for list_comments tool
 * Validates: Requirements 1.2, 1.3, 1.5, 1.7, 13.1
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { listComments } from "./list-comments.js";
import { drive_v3 } from "googleapis";

const ALLOWED_FOLDER = "allowed-folder-id";
const NATIVE_MIME = "application/vnd.google-apps.document";

function makeDeniedAccessController(docId: string): AccessController {
  const config = {
    allowedFolderIds: new Set([ALLOWED_FOLDER]),
    allowedDocIds: new Set<string>(),
    googleClientId: "fake",
    googleClientSecret: "fake",
  };
  const driveClient = {
    files: {
      get: vi.fn().mockResolvedValue({
        data: { id: docId, name: "Doc", mimeType: NATIVE_MIME, parents: ["other-folder"] },
      }),
    },
  } as unknown as drive_v3.Drive;
  return new AccessController(config, driveClient);
}

function makeAllowedAccessController(docId: string): AccessController {
  const config = {
    allowedFolderIds: new Set([ALLOWED_FOLDER]),
    allowedDocIds: new Set<string>(),
    googleClientId: "fake",
    googleClientSecret: "fake",
  };
  const driveClient = {
    files: {
      get: vi.fn().mockResolvedValue({
        data: { id: docId, name: "Doc", mimeType: NATIVE_MIME, parents: [ALLOWED_FOLDER] },
      }),
    },
  } as unknown as drive_v3.Drive;
  return new AccessController(config, driveClient);
}

const docIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);

// Feature: google-drive-mcp-v2, Property 1: Access check before API call
describe("list_comments — Property 1: Access check before API call", () => {
  it("drive.comments.list is never called for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const ac = makeDeniedAccessController(docId);
        const commentsListMock = vi.fn();
        const driveClient = { comments: { list: commentsListMock } } as unknown as drive_v3.Drive;

        const result = await listComments({ documentId: docId }, driveClient, ac);

        expect(result.isError).toBe(true);
        expect(commentsListMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("list_comments — Property 3: Access denied error message format", () => {
  it("returns exact access denied message for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const ac = makeDeniedAccessController(docId);
        const driveClient = { comments: { list: vi.fn() } } as unknown as drive_v3.Drive;

        const result = await listComments({ documentId: docId }, driveClient, ac);

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${docId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 4: list_comments result fields
describe("list_comments — Property 4: result fields", () => {
  it("each comment has id, author, content, createdTime, resolved", async () => {
    const commentArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      author: fc.record({ displayName: fc.string({ minLength: 1, maxLength: 30 }) }),
      content: fc.string({ minLength: 0, maxLength: 100 }),
      createdTime: fc.string({ minLength: 1, maxLength: 30 }),
      resolved: fc.boolean(),
    });

    await fc.assert(
      fc.asyncProperty(docIdArb, fc.array(commentArb, { minLength: 1, maxLength: 10 }), async (docId, comments) => {
        const ac = makeAllowedAccessController(docId);
        const driveClient = {
          comments: {
            list: vi.fn().mockResolvedValue({ data: { comments } }),
          },
        } as unknown as drive_v3.Drive;

        const result = await listComments({ documentId: docId }, driveClient, ac);

        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(Array.isArray(parsed)).toBe(true);
        for (const c of parsed) {
          expect(c).toHaveProperty("id");
          expect(c).toHaveProperty("author");
          expect(c).toHaveProperty("content");
          expect(c).toHaveProperty("createdTime");
          expect(c).toHaveProperty("resolved");
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("list_comments — Property 11: API errors caught", () => {
  it("returns isError: true when drive.comments.list throws", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, fc.string({ minLength: 1, maxLength: 50 }), async (docId, errMsg) => {
        const ac = makeAllowedAccessController(docId);
        const driveClient = {
          comments: {
            list: vi.fn().mockRejectedValue(new Error(errMsg)),
          },
        } as unknown as drive_v3.Drive;

        const result = await listComments({ documentId: docId }, driveClient, ac);

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Error:");
      }),
      { numRuns: 100 },
    );
  });
});
