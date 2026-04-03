/**
 * Feature: google-drive-mcp-v2
 * Property tests for delete_file tool
 * Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.6, 13.1
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { deleteFile } from "./delete-file.js";
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

// Feature: google-drive-mcp-v2, Property 1: Access check before API call
describe("delete_file — Property 1: Access check before API call", () => {
  it("drive.files.update is never called for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const ac = makeDeniedAC(fileId);
        const updateMock = vi.fn();
        const deleteMock = vi.fn();
        const dc = { files: { update: updateMock, delete: deleteMock } } as unknown as drive_v3.Drive;
        const result = await deleteFile({ fileId }, dc, ac);
        expect(result.isError).toBe(true);
        expect(updateMock).not.toHaveBeenCalled();
        expect(deleteMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("delete_file — Property 3: Access denied error message format", () => {
  it("returns exact access denied message", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const ac = makeDeniedAC(fileId);
        const dc = { files: { update: vi.fn(), delete: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await deleteFile({ fileId }, dc, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${fileId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 6: Mutation tools return confirmation containing the affected ID
describe("delete_file — Property 6: returns fileId in confirmation", () => {
  it("returned text contains the fileId", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const ac = makeAllowedAC(fileId);
        const dc = { files: { update: vi.fn().mockResolvedValue({ data: { id: fileId } }), delete: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await deleteFile({ fileId }, dc, ac);
        expect(result.isError).toBe(false);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(fileId);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 8: delete_file uses soft delete (trash), not permanent delete
describe("delete_file — Property 8: uses soft delete (trash)", () => {
  it("calls files.update with trashed:true and never calls files.delete", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const ac = makeAllowedAC(fileId);
        const updateMock = vi.fn().mockResolvedValue({ data: { id: fileId } });
        const deleteMock = vi.fn();
        const dc = { files: { update: updateMock, delete: deleteMock } } as unknown as drive_v3.Drive;
        const result = await deleteFile({ fileId }, dc, ac);
        expect(result.isError).toBe(false);
        expect(updateMock).toHaveBeenCalledTimes(1);
        expect(updateMock.mock.calls[0][0].requestBody).toEqual({ trashed: true });
        expect(deleteMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("delete_file — Property 11: API errors caught", () => {
  it("returns isError: true when drive.files.update throws", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (fileId) => {
        const ac = makeAllowedAC(fileId);
        const dc = { files: { update: vi.fn().mockRejectedValue(new Error("fail")), delete: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await deleteFile({ fileId }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
