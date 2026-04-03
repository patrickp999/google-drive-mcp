/**
 * Feature: google-drive-mcp-v2
 * Property tests for create_document tool
 * Validates: Requirements 10.2, 10.3, 10.5, 10.6, 10.7, 13.2
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { createDocument } from "./create-document.js";
import { drive_v3, docs_v1 } from "googleapis";

const ALLOWED_FOLDER = "allowed-folder-id";

function makeAC(allowedFolders: string[]): AccessController {
  const config = { allowedFolderIds: new Set(allowedFolders), allowedDocIds: new Set<string>(), googleClientId: "f", googleClientSecret: "f" };
  const dc = { files: { get: vi.fn() } } as unknown as drive_v3.Drive;
  return new AccessController(config, dc);
}

const folderIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);
const nameArb = fc.string({ minLength: 1, maxLength: 50 });
const contentArb = fc.string({ minLength: 1, maxLength: 200 });

// Feature: google-drive-mcp-v2, Property 2: Folder allowed check before API call
describe("create_document — Property 2: Folder allowed check before API call", () => {
  it("drive.files.create is never called for disallowed folderId", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, folderIdArb, async (name, folderId) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const createMock = vi.fn();
        const dc = { files: { create: createMock } } as unknown as drive_v3.Drive;
        const docsClient = { documents: { batchUpdate: vi.fn() } } as unknown as docs_v1.Docs;
        const result = await createDocument({ name, folderId }, dc, docsClient, ac);
        expect(result.isError).toBe(true);
        expect(createMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("create_document — Property 3: Access denied error message format", () => {
  it("returns exact access denied message for disallowed folder", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, folderIdArb, async (name, folderId) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const dc = { files: { create: vi.fn() } } as unknown as drive_v3.Drive;
        const docsClient = { documents: { batchUpdate: vi.fn() } } as unknown as docs_v1.Docs;
        const result = await createDocument({ name, folderId }, dc, docsClient, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${folderId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 7: Creation tools return id and name
describe("create_document — Property 7: returns id and name", () => {
  it("returned JSON contains id and name from Drive API response", async () => {
    const respArb = fc.record({ id: fc.string({ minLength: 1, maxLength: 30 }), name: fc.string({ minLength: 1, maxLength: 50 }) });
    await fc.assert(
      fc.asyncProperty(nameArb, respArb, async (name, resp) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const dc = { files: { create: vi.fn().mockResolvedValue({ data: resp }) } } as unknown as drive_v3.Drive;
        const docsClient = { documents: { batchUpdate: vi.fn() } } as unknown as docs_v1.Docs;
        const result = await createDocument({ name, folderId: ALLOWED_FOLDER }, dc, docsClient, ac);
        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed.id).toBe(resp.id);
        expect(parsed.name).toBe(resp.name);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 10: create_document with content inserts text into document body
describe("create_document — Property 10: content insertion via batchUpdate", () => {
  it("calls docs.documents.batchUpdate with insertText at index 1 for non-empty content", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, contentArb, async (name, content) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const newDocId = "new-doc-123";
        const dc = { files: { create: vi.fn().mockResolvedValue({ data: { id: newDocId, name } }) } } as unknown as drive_v3.Drive;
        const batchUpdateMock = vi.fn().mockResolvedValue({});
        const docsClient = { documents: { batchUpdate: batchUpdateMock } } as unknown as docs_v1.Docs;

        await createDocument({ name, folderId: ALLOWED_FOLDER, content }, dc, docsClient, ac);

        expect(batchUpdateMock).toHaveBeenCalledTimes(1);
        const call = batchUpdateMock.mock.calls[0][0];
        expect(call.documentId).toBe(newDocId);
        const insertReq = call.requestBody.requests[0].insertText;
        expect(insertReq.location.index).toBe(1);
        expect(insertReq.text).toBe(content);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("create_document — Property 11: API errors caught", () => {
  it("returns isError: true when drive.files.create throws", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, async (name) => {
        const ac = makeAC([ALLOWED_FOLDER]);
        const dc = { files: { create: vi.fn().mockRejectedValue(new Error("fail")) } } as unknown as drive_v3.Drive;
        const docsClient = { documents: { batchUpdate: vi.fn() } } as unknown as docs_v1.Docs;
        const result = await createDocument({ name, folderId: ALLOWED_FOLDER }, dc, docsClient, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
