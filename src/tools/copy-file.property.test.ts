/**
 * Feature: google-drive-mcp-v2
 * Property tests for copy_file tool
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 13.1, 13.2
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { copyFile } from "./copy-file.js";
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
describe("copy_file — Property 1: Access check before API call for fileId", () => {
  it("drive.files.copy is never called for denied fileId", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, async (fileId, newName) => {
        const ac = makeDeniedAC(fileId);
        const mock = vi.fn();
        const dc = { files: { copy: mock } } as unknown as drive_v3.Drive;
        const result = await copyFile({ fileId, destinationFolderId: ALLOWED_FOLDER, newName }, dc, ac);
        expect(result.isError).toBe(true);
        expect(mock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 2: Folder allowed check before API call
describe("copy_file — Property 2: Folder allowed check for destinationFolderId", () => {
  it("drive.files.copy is never called for disallowed destinationFolderId even when fileId is allowed", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, idArb, nameArb, async (fileId, destFolder, newName) => {
        // AC that allows fileId but denies the random destFolder
        const config = { allowedFolderIds: new Set([ALLOWED_FOLDER]), allowedDocIds: new Set<string>(), googleClientId: "f", googleClientSecret: "f" };
        const acDc = {
          files: {
            get: vi.fn().mockImplementation(({ fileId: fid }: { fileId: string }) => {
              if (fid === fileId) {
                return Promise.resolve({ data: { id: fileId, name: "D", mimeType: NATIVE_MIME, parents: [ALLOWED_FOLDER] } });
              }
              // Random destFolder — return no parents so it gets denied
              return Promise.resolve({ data: { parents: [] } });
            }),
          },
        } as unknown as drive_v3.Drive;
        const ac = new AccessController(config, acDc);
        const mock = vi.fn();
        const dc = {
          files: {
            copy: mock,
            get: vi.fn().mockResolvedValue({ data: { parents: [] } }),
          },
        } as unknown as drive_v3.Drive;
        const result = await copyFile({ fileId, destinationFolderId: destFolder, newName }, dc, ac);
        expect(result.isError).toBe(true);
        expect(mock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("copy_file — Property 3: Access denied error message format", () => {
  it("returns exact access denied message for denied fileId", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, async (fileId, newName) => {
        const ac = makeDeniedAC(fileId);
        const dc = { files: { copy: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await copyFile({ fileId, destinationFolderId: ALLOWED_FOLDER, newName }, dc, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${fileId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 7: Creation/copy tools return id and name
describe("copy_file — Property 7: returns id and name", () => {
  it("returned JSON contains id and name from Drive API response", async () => {
    const respArb = fc.record({ id: fc.string({ minLength: 1, maxLength: 30 }), name: fc.string({ minLength: 1, maxLength: 50 }) });
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, respArb, async (fileId, newName, resp) => {
        const ac = makeAllowedAC(fileId);
        const dc = { files: { copy: vi.fn().mockResolvedValue({ data: resp }) } } as unknown as drive_v3.Drive;
        const result = await copyFile({ fileId, destinationFolderId: ALLOWED_FOLDER, newName }, dc, ac);
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
describe("copy_file — Property 11: API errors caught", () => {
  it("returns isError: true when drive.files.copy throws", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, nameArb, async (fileId, newName) => {
        const ac = makeAllowedAC(fileId);
        const dc = { files: { copy: vi.fn().mockRejectedValue(new Error("fail")) } } as unknown as drive_v3.Drive;
        const result = await copyFile({ fileId, destinationFolderId: ALLOWED_FOLDER, newName }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
