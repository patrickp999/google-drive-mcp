/**
 * Feature: google-drive-mcp-v2
 * Property tests for export_as_pdf tool
 * Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.8, 11.9, 11.10, 13.1, 13.2
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { exportAsPdf } from "./export-as-pdf.js";
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
const filenameArb = fc.string({ minLength: 1, maxLength: 50 });

function makeDriveClientForExport(uploadedName: string): drive_v3.Drive {
  return {
    files: {
      export: vi.fn().mockResolvedValue({ data: new ArrayBuffer(10) }),
      create: vi.fn().mockResolvedValue({ data: { id: "pdf-id", name: uploadedName } }),
    },
  } as unknown as drive_v3.Drive;
}

// Feature: google-drive-mcp-v2, Property 1: Access check before API call
describe("export_as_pdf — Property 1: Access check before API call for documentId", () => {
  it("drive.files.export is never called for denied documentId", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, filenameArb, async (docId, filename) => {
        const ac = makeDeniedAC(docId);
        const exportMock = vi.fn();
        const dc = { files: { export: exportMock, create: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await exportAsPdf({ documentId: docId, destinationFolderId: ALLOWED_FOLDER, filename }, dc, ac);
        expect(result.isError).toBe(true);
        expect(exportMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 2: Folder allowed check before API call
describe("export_as_pdf — Property 2: Folder allowed check for destinationFolderId", () => {
  it("drive.files.export is never called for disallowed destinationFolderId", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, idArb, filenameArb, async (docId, destFolder, filename) => {
        // AC that allows docId but denies the random destFolder
        const config = { allowedFolderIds: new Set([ALLOWED_FOLDER]), allowedDocIds: new Set<string>(), googleClientId: "f", googleClientSecret: "f" };
        const acDc = {
          files: {
            get: vi.fn().mockImplementation(({ fileId: fid }: { fileId: string }) => {
              if (fid === docId) {
                return Promise.resolve({ data: { id: docId, name: "D", mimeType: NATIVE_MIME, parents: [ALLOWED_FOLDER] } });
              }
              return Promise.resolve({ data: { parents: [] } });
            }),
          },
        } as unknown as drive_v3.Drive;
        const ac = new AccessController(config, acDc);
        const exportMock = vi.fn();
        const dc = {
          files: {
            export: exportMock,
            create: vi.fn(),
            get: vi.fn().mockResolvedValue({ data: { parents: [] } }),
          },
        } as unknown as drive_v3.Drive;
        const result = await exportAsPdf({ documentId: docId, destinationFolderId: destFolder, filename }, dc, ac);
        expect(result.isError).toBe(true);
        expect(exportMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 3: Access denied error message format
describe("export_as_pdf — Property 3: Access denied error message format", () => {
  it("returns exact access denied message for denied documentId", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, filenameArb, async (docId, filename) => {
        const ac = makeDeniedAC(docId);
        const dc = { files: { export: vi.fn(), create: vi.fn() } } as unknown as drive_v3.Drive;
        const result = await exportAsPdf({ documentId: docId, destinationFolderId: ALLOWED_FOLDER, filename }, dc, ac);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain(`Access denied: ${docId} is not in the allowed folders or document list.`);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 7: Creation tools return id and name
describe("export_as_pdf — Property 7: returns id and name", () => {
  it("returned JSON contains id and name", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, filenameArb, async (docId, filename) => {
        const ac = makeAllowedAC(docId);
        const expectedName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
        const dc = makeDriveClientForExport(expectedName);
        const result = await exportAsPdf({ documentId: docId, destinationFolderId: ALLOWED_FOLDER, filename }, dc, ac);
        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed).toHaveProperty("id");
        expect(parsed).toHaveProperty("name");
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 9: PDF filename always ends with .pdf
describe("export_as_pdf — Property 9: filename always ends with .pdf", () => {
  it("the name in drive.files.create call ends with .pdf for any input filename", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, filenameArb, async (docId, filename) => {
        const ac = makeAllowedAC(docId);
        const createMock = vi.fn().mockResolvedValue({ data: { id: "pdf-id", name: "out.pdf" } });
        const dc = {
          files: {
            export: vi.fn().mockResolvedValue({ data: new ArrayBuffer(10) }),
            create: createMock,
          },
        } as unknown as drive_v3.Drive;

        await exportAsPdf({ documentId: docId, destinationFolderId: ALLOWED_FOLDER, filename }, dc, ac);

        expect(createMock).toHaveBeenCalledTimes(1);
        const uploadedName = createMock.mock.calls[0][0].requestBody.name;
        expect(uploadedName.endsWith(".pdf")).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: google-drive-mcp-v2, Property 11: API errors caught
describe("export_as_pdf — Property 11: API errors caught", () => {
  it("returns isError: true when drive.files.export throws", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, filenameArb, async (docId, filename) => {
        const ac = makeAllowedAC(docId);
        const dc = {
          files: {
            export: vi.fn().mockRejectedValue(new Error("fail")),
            create: vi.fn(),
          },
        } as unknown as drive_v3.Drive;
        const result = await exportAsPdf({ documentId: docId, destinationFolderId: ALLOWED_FOLDER, filename }, dc, ac);
        expect(result.isError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
