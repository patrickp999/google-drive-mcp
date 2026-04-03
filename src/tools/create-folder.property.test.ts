/**
 * Feature: google-drive-mcp-v2
 * Property tests for create_folder tool
 * Validates: Requirements 6.2, 6.3, 6.6, 6.7, 13.2
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { createFolder } from "./create-folder.js";
import { drive_v3 } from "googleapis";

const ALLOWED_FOLDER = "allowed-folder-id";

function makeAC(allowedFolders: string[]): AccessController {
  const config = { allowedFolderIds: new Set(allowedFolders), allowedDocIds: new Set<string>(), googleClientId: "f", googleClientSecret: "f" };
  const dc = { files: { get: vi.fn() } } as unknown as drive_v3.Drive;
  return new AccessController(config, dc);
}

const folderIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);
const nameArb = fc.string({ minLength: 1, maxLength: 50 });

// Feature: google-drive-mcp-v2, Property 2: Folder allowed check before API call
describe("create_folder — Property 2: Folder allowed check before API call", () => {
  it("drive.files.create is never called for disallowed parentFolderId", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, folderIdArb, async (name, folderId) => {
        const ac = makeAC([ALLOWED_FOLDER]); // folderId won't match
        const createMock = vi.fn();
        const dc = { files: { create: createMock } } as unknown as drive_v3.Drive;
        const result = await createFolder({ name, parentFolderId: folderId }, dc, ac);
        expect(result.isError).toBe(true);
        expect(createMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("create_folder — Property 3: Access denied error message format", () => {
  it("returns exact access denied message for disallowed folder", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, folderIdArb, async (name, folderId) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const dc = { files: { create: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await createFolder({ name, parentFolderId: folderId }, dc, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${folderId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 7: Creation tools return id and name
describe("create_folder — Property 7: returns id and name", () => {
  it("returned JSON contains id and name from Drive API response", async () => {
    const responseArb = fc.record({ id: fc.string({ minLength: 1, maxLength: 30 }), name: fc.string({ minLength: 1, maxLength: 50 }) });
    await fc.assert(
      fc.asyncProperty(nameArb, responseArb, async (name, resp) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const dc = { files: { create: vi.fn().mockResolvedValue({ data: resp }) } } as unknown as drive_v3.Drive;
        const result = await createFolder({ name, parentFolderId: ALLOWED_FOLDER }, dc, ac);
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
describe("create_folder — Property 11: API errors caught", () => {
  it("returns isError: true when drive.files.create throws", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, async (name) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const dc = { files: { create: vi.fn().mockRejectedValue(new Error("fail")) } } as unknown as drive_v3.Drive;
        const result = await createFolder({ name, parentFolderId: ALLOWED_FOLDER }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
