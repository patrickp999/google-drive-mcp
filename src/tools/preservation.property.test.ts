/**
 * Property 2: Preservation — Native Google Doc Behavior Unchanged
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * Observation-first methodology:
 *   On UNFIXED code, for inputs where isBugCondition returns false
 *   (mimeType = application/vnd.google-apps.document), we observe the output
 *   shapes and write properties that assert those shapes are preserved.
 *
 * Observed shapes on unfixed code:
 *   - read_document  → { title: string, content: string }
 *   - add_comment    → { commentId: string }
 *   - suggest_edit   → { commentId: string }
 *   - replace_text   → { replacements: number }
 *   - denied ID      → isError: true, text contains "Access denied"
 *
 * EXPECTED OUTCOME: All tests PASS on unfixed code (baseline confirmed).
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AccessController } from "../access-controller.js";
import { readDocument } from "./read-document.js";
import { addComment } from "./add-comment.js";
import { suggestEdit } from "./suggest-edit.js";
import { replaceText } from "./replace-text.js";
import { drive_v3, docs_v1 } from "googleapis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NATIVE_MIME = "application/vnd.google-apps.document";
const ALLOWED_FOLDER = "allowed-folder-id";
const ALLOWED_DOC_ID = "allowed-doc-id";

/** Build a minimal AccessController whose Drive client returns a native Google Doc parent. */
function makeAccessController(
  docId: string,
  opts: { allowed: boolean } = { allowed: true }
): AccessController {
  const config = {
    allowedFolderIds: new Set([ALLOWED_FOLDER]),
    allowedDocIds: new Set<string>(),
    googleClientId: "fake-client-id",
    googleClientSecret: "fake-client-secret",
  };

  const driveClient = {
    files: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: docId,
          name: "My Native Doc",
          mimeType: NATIVE_MIME,
          parents: opts.allowed ? [ALLOWED_FOLDER] : ["some-other-folder"],
        },
      }),
    },
  } as unknown as drive_v3.Drive;

  return new AccessController(config, driveClient);
}

/** Minimal Docs client that returns a document with a single paragraph. */
function makeDocsClient(docId: string, title = "Test Doc", bodyText = "Hello world"): docs_v1.Docs {
  return {
    documents: {
      get: vi.fn().mockResolvedValue({
        data: {
          title,
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      startIndex: 1,
                      textRun: { content: bodyText },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      batchUpdate: vi.fn().mockResolvedValue({
        data: {
          replies: [{ replaceAllText: { occurrencesChanged: 2 } }],
        },
      }),
    },
  } as unknown as docs_v1.Docs;
}

/** Drive client used by add_comment / suggest_edit for comments.create. */
function makeDriveCommentClient(commentId = "comment-abc"): drive_v3.Drive {
  return {
    files: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: ALLOWED_DOC_ID,
          name: "My Native Doc",
          mimeType: NATIVE_MIME,
          parents: [ALLOWED_FOLDER],
        },
      }),
    },
    comments: {
      create: vi.fn().mockResolvedValue({ data: { id: commentId } }),
    },
  } as unknown as drive_v3.Drive;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates plausible Google Doc IDs (alphanumeric, 10-44 chars). */
const docIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);

/** Generates non-empty strings suitable for document titles. */
const titleArb = fc.string({ minLength: 1, maxLength: 80 });

/** Generates non-empty body text strings. */
const bodyTextArb = fc.string({ minLength: 1, maxLength: 200 });

/** Generates replacement counts (0 or positive). */
const replacementsArb = fc.nat({ max: 50 });

// ---------------------------------------------------------------------------
// Property 2a: read_document returns { title, content } for native docs
// Validates: Requirement 3.1
// ---------------------------------------------------------------------------

describe("Preservation Property 2a — read_document returns { title, content } for native Google Docs", () => {
  it("returns { title, content } shape for any native doc", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, titleArb, bodyTextArb, async (docId, title, bodyText) => {
        const accessController = makeAccessController(docId);
        const docsClient = makeDocsClient(docId, title, bodyText);

        const result = await readDocument({ documentId: docId }, docsClient, accessController);

        expect(result.isError).toBe(false);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");

        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(typeof parsed.title).toBe("string");
        expect(typeof parsed.content).toBe("string");
        expect(parsed.title).toBe(title);
        expect(parsed.content).toContain(bodyText);
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2b: add_comment returns { commentId } for native docs
// Validates: Requirement 3.2
// ---------------------------------------------------------------------------

describe("Preservation Property 2b — add_comment returns { commentId } for native Google Docs", () => {
  it("returns { commentId } shape for any native doc", async () => {
    const commentIdArb = fc.stringMatching(/^[A-Za-z0-9]{4,20}$/);

    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, commentId) => {
        const driveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: {
                id: docId,
                name: "My Native Doc",
                mimeType: NATIVE_MIME,
                parents: [ALLOWED_FOLDER],
              },
            }),
          },
          comments: {
            create: vi.fn().mockResolvedValue({ data: { id: commentId } }),
          },
        } as unknown as drive_v3.Drive;

        const accessController = makeAccessController(docId);

        const result = await addComment(
          { documentId: docId, content: "A comment", anchorText: "some text" },
          driveClient,
          accessController
        );

        expect(result.isError).toBe(false);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");

        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(typeof parsed.commentId).toBe("string");
        expect(parsed.commentId).toBe(commentId);
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2c: suggest_edit returns { commentId } for native docs
// Validates: Requirement 3.3
// ---------------------------------------------------------------------------

describe("Preservation Property 2c — suggest_edit returns { commentId } for native Google Docs", () => {
  it("returns { commentId } shape for any native doc", async () => {
    const commentIdArb = fc.stringMatching(/^[A-Za-z0-9]{4,20}$/);

    await fc.assert(
      fc.asyncProperty(docIdArb, commentIdArb, async (docId, commentId) => {
        const driveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: {
                id: docId,
                name: "My Native Doc",
                mimeType: NATIVE_MIME,
                parents: [ALLOWED_FOLDER],
              },
            }),
          },
          comments: {
            create: vi.fn().mockResolvedValue({ data: { id: commentId } }),
          },
        } as unknown as drive_v3.Drive;

        const accessController = makeAccessController(docId);

        const result = await suggestEdit(
          { documentId: docId, originalText: "some text", suggestedText: "new text" },
          driveClient,
          accessController
        );

        expect(result.isError).toBe(false);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");

        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(typeof parsed.commentId).toBe("string");
        expect(parsed.commentId).toBe(commentId);
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2d: replace_text returns { replacements } for native docs
// Validates: Requirement 3.4
// ---------------------------------------------------------------------------

describe("Preservation Property 2d — replace_text returns { replacements } for native Google Docs", () => {
  it("returns { replacements } shape for any native doc", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, replacementsArb, async (docId, replacements) => {
        const accessController = makeAccessController(docId);
        const docsClient = {
          documents: {
            batchUpdate: vi.fn().mockResolvedValue({
              data: {
                replies: [{ replaceAllText: { occurrencesChanged: replacements } }],
              },
            }),
          },
        } as unknown as docs_v1.Docs;

        const result = await replaceText(
          { documentId: docId, findText: "foo", replaceText: "bar" },
          docsClient,
          accessController
        );

        expect(result.isError).toBe(false);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");

        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(typeof parsed.replacements).toBe("number");
        expect(parsed.replacements).toBe(replacements);
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2e: Access denied fires before any Drive MIME or Docs API call
// Validates: Requirement 3.5
// ---------------------------------------------------------------------------

describe("Preservation Property 2e — access denied fires before MIME check or Docs API call", () => {
  it("read_document: access denied before any Docs API call for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const accessController = makeAccessController(docId, { allowed: false });
        const docsGetMock = vi.fn();
        const docsClient = {
          documents: { get: docsGetMock },
        } as unknown as docs_v1.Docs;

        const result = await readDocument({ documentId: docId }, docsClient, accessController);

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Access denied");
        expect(docsGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });

  it("add_comment: access denied before any Drive comments call for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const accessController = makeAccessController(docId, { allowed: false });
        const commentsCreateMock = vi.fn();
        const driveClient = {
          ...makeDriveCommentClient(),
          comments: { create: commentsCreateMock },
        } as unknown as drive_v3.Drive;

        const result = await addComment(
          { documentId: docId, content: "comment", anchorText: "text" },
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Access denied");
        expect(commentsCreateMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });

  it("suggest_edit: access denied before any Drive comments call for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const accessController = makeAccessController(docId, { allowed: false });
        const commentsCreateMock = vi.fn();
        const driveClient = {
          ...makeDriveCommentClient(),
          comments: { create: commentsCreateMock },
        } as unknown as drive_v3.Drive;

        const result = await suggestEdit(
          { documentId: docId, originalText: "text", suggestedText: "new" },
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Access denied");
        expect(commentsCreateMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });

  it("replace_text: access denied before any Docs API call for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const accessController = makeAccessController(docId, { allowed: false });
        const batchUpdateMock = vi.fn();
        const docsClient = {
          documents: { batchUpdate: batchUpdateMock },
        } as unknown as docs_v1.Docs;

        const result = await replaceText(
          { documentId: docId, findText: "foo", replaceText: "bar" },
          docsClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Access denied");
        expect(batchUpdateMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by new table-adjacent preservation properties
// ---------------------------------------------------------------------------

const NATIVE_MIME_PRES = "application/vnd.google-apps.document";
const ALLOWED_FOLDER_PRES = "allowed-folder-id";
const PRES_DOC_ID = "pres-test-doc-id-5678";

function makeNativeAccessControllerPres(): AccessController {
  const config = {
    allowedFolderIds: new Set([ALLOWED_FOLDER_PRES]),
    allowedDocIds: new Set<string>(),
    googleClientId: "fake-client-id",
    googleClientSecret: "fake-client-secret",
  };
  const driveClient = {
    files: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: PRES_DOC_ID,
          name: "Pres Test Doc",
          mimeType: NATIVE_MIME_PRES,
          parents: [ALLOWED_FOLDER_PRES],
        },
      }),
    },
  } as unknown as drive_v3.Drive;
  return new AccessController(config, driveClient);
}

function makeDocsClientWithBodyPres(bodyContent: object[]): docs_v1.Docs {
  return {
    documents: {
      get: vi.fn().mockResolvedValue({
        data: {
          title: "Pres Test Doc",
          body: { content: bodyContent },
        },
      }),
    },
  } as unknown as docs_v1.Docs;
}

// ---------------------------------------------------------------------------
// Property 2f: Paragraph-only docs — content equals concatenated text runs
// ---------------------------------------------------------------------------

describe("Preservation Property 2f — paragraph-only docs produce content equal to concatenated text runs", () => {
  it("content equals concatenated text runs for any paragraph-only body", async () => {
    const textRunsArb = fc.array(
      fc.string({ minLength: 1, maxLength: 50 }),
      { minLength: 1, maxLength: 10 }
    );

    await fc.assert(
      fc.asyncProperty(textRunsArb, async (textRuns) => {
        const bodyContent = textRuns.map((text) => ({
          paragraph: {
            elements: [{ textRun: { content: text } }],
          },
        }));

        const expectedContent = textRuns.join("");

        const accessController = makeNativeAccessControllerPres();
        const docsClient = makeDocsClientWithBodyPres(bodyContent);

        const result = await readDocument({ documentId: PRES_DOC_ID }, docsClient, accessController);

        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed.content).toBe(expectedContent);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2g: Paragraphs before/after empty table — order preserved
// ---------------------------------------------------------------------------

describe("Preservation Property 2g — paragraph text order preserved around empty table", () => {
  it("paragraph text order is maintained when an empty table sits between paragraphs", async () => {
    const textArb = fc.string({ minLength: 1, maxLength: 40 });

    await fc.assert(
      fc.asyncProperty(textArb, textArb, async (before, after) => {
        const emptyTable = {
          table: {
            tableRows: [
              {
                tableCells: [
                  { content: [{ paragraph: { elements: [] } }] },
                ],
              },
            ],
          },
        };

        const bodyWithTable = [
          { paragraph: { elements: [{ textRun: { content: before } }] } },
          emptyTable,
          { paragraph: { elements: [{ textRun: { content: after } }] } },
        ];

        const bodyWithoutTable = [
          { paragraph: { elements: [{ textRun: { content: before } }] } },
          { paragraph: { elements: [{ textRun: { content: after } }] } },
        ];

        const accessController = makeNativeAccessControllerPres();

        const resultWith = await readDocument(
          { documentId: PRES_DOC_ID },
          makeDocsClientWithBodyPres(bodyWithTable),
          accessController
        );
        const resultWithout = await readDocument(
          { documentId: PRES_DOC_ID },
          makeDocsClientWithBodyPres(bodyWithoutTable),
          accessController
        );

        expect(resultWith.isError).toBe(false);
        expect(resultWithout.isError).toBe(false);

        const parsedWith = JSON.parse((resultWith.content[0] as { type: string; text: string }).text);
        const parsedWithout = JSON.parse((resultWithout.content[0] as { type: string; text: string }).text);

        expect(parsedWith.content).toBe(parsedWithout.content);
        expect(parsedWith.content).toContain(before);
        expect(parsedWith.content).toContain(after);
        const beforeIdx = parsedWith.content.indexOf(before);
        const afterIdx = parsedWith.content.indexOf(after);
        expect(beforeIdx).toBeLessThan(afterIdx);
      }),
      { numRuns: 40 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2h: Paragraph with no elements — no extra output, no crash
// ---------------------------------------------------------------------------

describe("Preservation Property 2h — paragraph with no elements produces no extra output and no crash", () => {
  it("empty paragraphs contribute nothing and do not crash", async () => {
    const textArb = fc.string({ minLength: 1, maxLength: 50 });
    const emptyCountArb = fc.nat({ max: 5 });

    await fc.assert(
      fc.asyncProperty(textArb, emptyCountArb, async (text, emptyCount) => {
        const emptyParagraph = { paragraph: { elements: [] } };
        const realParagraph = { paragraph: { elements: [{ textRun: { content: text } }] } };

        const bodyContent = [
          ...Array(emptyCount).fill(emptyParagraph),
          realParagraph,
          ...Array(emptyCount).fill(emptyParagraph),
        ];

        const accessController = makeNativeAccessControllerPres();
        const docsClient = makeDocsClientWithBodyPres(bodyContent);

        const result = await readDocument({ documentId: PRES_DOC_ID }, docsClient, accessController);

        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
        expect(parsed.content).toBe(text);
      }),
      { numRuns: 40 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2i: Empty TOC preservation — no crash, no output
// ---------------------------------------------------------------------------

describe("Preservation Property 2i — empty tableOfContents produces no output and no crash", () => {
  it("empty TOC content produces same output as no TOC element", async () => {
    const accessController = makeNativeAccessControllerPres();

    const bodyWithEmptyToc = [
      { tableOfContents: { content: [] } },
    ];

    const bodyWithNoToc: object[] = [];

    const resultWithEmptyToc = await readDocument(
      { documentId: PRES_DOC_ID },
      makeDocsClientWithBodyPres(bodyWithEmptyToc),
      accessController
    );

    const resultWithNoToc = await readDocument(
      { documentId: PRES_DOC_ID },
      makeDocsClientWithBodyPres(bodyWithNoToc),
      accessController
    );

    expect(resultWithEmptyToc.isError).toBe(false);
    expect(resultWithNoToc.isError).toBe(false);

    const parsedWithEmptyToc = JSON.parse(
      (resultWithEmptyToc.content[0] as { type: string; text: string }).text
    );
    const parsedWithNoToc = JSON.parse(
      (resultWithNoToc.content[0] as { type: string; text: string }).text
    );

    expect(parsedWithEmptyToc.content).toBe(parsedWithNoToc.content);
    expect(parsedWithEmptyToc.content).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Property 2j: Document order preservation — paragraph, TOC, paragraph
// ---------------------------------------------------------------------------

describe("Preservation Property 2j — document order preserved around empty tableOfContents", () => {
  it("content equals before+after when empty TOC sits between two paragraphs", async () => {
    const textArb = fc.string({ minLength: 1, maxLength: 40 });

    await fc.assert(
      fc.asyncProperty(textArb, textArb, async (before, after) => {
        const bodyContent = [
          { paragraph: { elements: [{ textRun: { content: before } }] } },
          { tableOfContents: { content: [] } },
          { paragraph: { elements: [{ textRun: { content: after } }] } },
        ];

        const accessController = makeNativeAccessControllerPres();
        const docsClient = makeDocsClientWithBodyPres(bodyContent);

        const result = await readDocument(
          { documentId: PRES_DOC_ID },
          docsClient,
          accessController
        );

        expect(result.isError).toBe(false);
        const parsed = JSON.parse(
          (result.content[0] as { type: string; text: string }).text
        );

        expect(parsed.content).toBe(before + after);

        const beforeIdx = parsed.content.indexOf(before);
        const afterIdx = parsed.content.indexOf(after);
        expect(beforeIdx).toBeLessThan(afterIdx);
      }),
      { numRuns: 40 }
    );
  });
});
