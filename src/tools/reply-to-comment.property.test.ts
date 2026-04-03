/**
 * Feature: google-drive-mcp-v2
 * Property tests for reply_to_comment tool
 * Validates: Requirements 3.2, 3.3, 3.5, 3.7, 13.1
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { replyToComment } from "./reply-to-comment.js";
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
const replyIdArb = fc.stringMatching(/^[A-Za-z0-9]{4,20}$/);

// Feature: google-drive-mcp-v2, Property 1: Access check before API call
describe("reply_to_comment — Property 1: Access check before API call", () => {
  it("drive.replies.create is never called for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, cId) => {
        const ac = makeDeniedAC(docId);
        const mock = vi.fn();
        const dc = { replies: { create: mock } } as unknown as drive_v3.Drive;
        const result = await replyToComment({ documentId: docId, commentId: cId, content: "reply" }, dc, ac);
        expect(result.isError).toBe(true);
        expect(mock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("reply_to_comment — Property 3: Access denied error message format", () => {
  it("returns exact access denied message", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, cId) => {
        const ac = makeDeniedAC(docId);
        const dc = { replies: { create: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await replyToComment({ documentId: docId, commentId: cId, content: "reply" }, dc, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${docId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 6: Mutation tools return confirmation containing the affected ID
describe("reply_to_comment — Property 6: returns replyId", () => {
  it("returned JSON contains replyId matching mock response", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, replyIdArb, async (docId, cId, rId) => {
        const ac = makeAllowedAC(docId);
        const dc = { replies: { create: vi.fn().mockResolvedValue({ data: { id: rId } }) } } as unknown as drive_v3.Drive;
        const result = await replyToComment({ documentId: docId, commentId: cId, content: "reply" }, dc, ac);
        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed.replyId).toBe(rId);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("reply_to_comment — Property 11: API errors caught", () => {
  it("returns isError: true when drive.replies.create throws", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, cId) => {
        const ac = makeAllowedAC(docId);
        const dc = { replies: { create: vi.fn().mockRejectedValue(new Error("fail")) } } as unknown as drive_v3.Drive;
        const result = await replyToComment({ documentId: docId, commentId: cId, content: "reply" }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
