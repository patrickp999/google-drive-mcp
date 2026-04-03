/**
 * Feature: google-drive-mcp-v2
 * Property tests for rename_file tool
 * Validates: Requirements 8.2, 8.3, 8.5, 8.6, 13.1
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { renameFile } from "./rename-file.js";
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

const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);
const nameArb = fc.string({ minLength: 1, maxLength: 50 });

// Feature: google-drive-mcp-v2, Property 1: Access check before API call
describe("rename_file — Property 1: Access check before API call", () => {
  it("drive.files.update is never called for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, async (fileId, newName) => {
        const ac = makeDeniedAC(fileId);
        const mock = vi.fn();
        const dc = { files: { update: mock } } as unknown as drive_v3.Drive;
        const result = await renameFile({ fileId, newName }, dc, ac);
        expect(result.isError).toBe(true);
        expect(mock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("rename_file — Property 3: Access denied error message format", () => {
  it("returns exact access denied message", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, async (fileId, newName) => {
        const ac = makeDeniedAC(fileId);
        const dc = { files: { update: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await renameFile({ fileId, newName }, dc, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${fileId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 6: Mutation tools return confirmation containing the affected ID
describe("rename_file — Property 6: returns id and name", () => {
  it("returned JSON contains id matching the file", async () => {
    const respArb = fc.record({ id: fc.string({ minLength: 1, maxLength: 30 }), name: fc.string({ minLength: 1, maxLength: 50 }) });
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, respArb, async (fileId, newName, resp) => {
        const ac = makeAllowedAC(fileId);
        const dc = { files: { update: vi.fn().mockResolvedValue({ data: resp }) } } as unknown as drive_v3.Drive;
        const result = await renameFile({ fileId, newName }, dc, ac);
        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed.id).toBe(resp.id);
        expect(parsed.name).toBe(resp.name);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("rename_file — Property 11: API errors caught", () => {
  it("returns isError: true when drive.files.update throws", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, async (fileId, newName) => {
        const ac = makeAllowedAC(fileId);
        const dc = { files: { update: vi.fn().mockRejectedValue(new Error("fail")) } } as unknown as drive_v3.Drive;
        const result = await renameFile({ fileId, newName }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
