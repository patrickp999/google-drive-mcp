/**
 * Feature: google-drive-mcp-v2
 * Property tests for get_comment tool
 * Validates: Requirements 2.2, 2.3, 2.5, 2.7, 13.1
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { getComment } from "./get-comment.js";
import { drive_v3 } from "googleapis";

const ALLOWED_FOLDER = "allowed-folder-id";
const NATIVE_MIME = "application/vnd.google-apps.document";

function makeDeniedAC(docId: string): AccessController {
  const config = { allowedFolderIds: new Set([ALLOWED_FOLDER]), allowedDocIds: new Set<string>(), googleClientId: "f", googleClientSecret: "f" };
  const dc = { files: { get: vi.fn().mockResolvedValue({ data: { id: docId, name: "D", mimeType: NATIVE_MIME, parents: ["other"] } }) } } as unknown as drive_v3.Drive;
  return new AccessController(config, dc);
}

function makeAllowedAC(docId: string): AccessController {
  const config = { allowedFolderIds: new Set([ALLOWED_FOLDER]), allowedDocIds: new Set<string>(), googleClientId: "f", googleClientSecret: "f" };
  const dc = { files: { get: vi.fn().mockResolvedValue({ data: { id: docId, name: "D", mimeType: NATIVE_MIME, parents: [ALLOWED_FOLDER] } }) } } as unknown as drive_v3.Drive;
  return new AccessController(config, dc);
}

const docIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);
const commentIdArb = fc.stringMatching(/^[A-Za-z0-9]{4,20}$/);

// Feature: google-drive-mcp-v2, Property 1: Access check before API call
describe("get_comment — Property 1: Access check before API call", () => {
  it("drive.comments.get is never called for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, cId) => {
        const ac = makeDeniedAC(docId);
        const mock = vi.fn();
        const dc = { comments: { get: mock } } as unknown as drive_v3.Drive;
        const result = await getComment({ documentId: docId, commentId: cId }, dc, ac);
        expect(result.isError).toBe(true);
        expect(mock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("get_comment — Property 3: Access denied error message format", () => {
  it("returns exact access denied message", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, cId) => {
        const ac = makeDeniedAC(docId);
        const dc = { comments: { get: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await getComment({ documentId: docId, commentId: cId }, dc, ac);
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${docId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 5: get_comment result includes full reply list
describe("get_comment — Property 5: result includes full reply list", () => {
  it("returned comment has all fields and replies array with correct fields", async () => {
    const replyArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      author: fc.record({ displayName: fc.string({ minLength: 1, maxLength: 30 }) }),
      content: fc.string({ minLength: 0, maxLength: 100 }),
      createdTime: fc.string({ minLength: 1, maxLength: 30 }),
    });
    const commentDataArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      author: fc.record({ displayName: fc.string({ minLength: 1, maxLength: 30 }) }),
      content: fc.string({ minLength: 0, maxLength: 100 }),
      createdTime: fc.string({ minLength: 1, maxLength: 30 }),
      resolved: fc.boolean(),
      replies: fc.array(replyArb, { minLength: 0, maxLength: 5 }),
    });

    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, commentDataArb, async (docId, cId, commentData) => {
        const ac = makeAllowedAC(docId);
        const dc = {
          comments: { get: vi.fn().mockResolvedValue({ data: commentData }) },
        } as unknown as drive_v3.Drive;

        const result = await getComment({ documentId: docId, commentId: cId }, dc, ac);
        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed).toHaveProperty("id");
        expect(parsed).toHaveProperty("author");
        expect(parsed).toHaveProperty("content");
        expect(parsed).toHaveProperty("createdTime");
        expect(parsed).toHaveProperty("resolved");
        expect(Array.isArray(parsed.replies)).toBe(true);
        for (const r of parsed.replies) {
          expect(r).toHaveProperty("id");
          expect(r).toHaveProperty("author");
          expect(r).toHaveProperty("content");
          expect(r).toHaveProperty("createdTime");
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("get_comment — Property 11: API errors caught", () => {
  it("returns isError: true when drive.comments.get throws", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, fc.string({ minLength: 1, maxLength: 50 }), async (docId, cId, errMsg) => {
        const ac = makeAllowedAC(docId);
        const dc = { comments: { get: vi.fn().mockRejectedValue(new Error(errMsg)) } } as unknown as drive_v3.Drive;
        const result = await getComment({ documentId: docId, commentId: cId }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
