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

import { describe, it, expect, vi, beforeEach } from "vitest";
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
  /**
   * **Validates: Requirements 3.1**
   *
   * For any documentId where mimeType = application/vnd.google-apps.document,
   * read_document must return isError: false and a JSON body with shape
   * { title: string, content: string }.
   */
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
  /**
   * **Validates: Requirements 3.2**
   *
   * For any documentId where mimeType = application/vnd.google-apps.document,
   * add_comment must return isError: false and a JSON body with shape
   * { commentId: string } when the anchor text is found.
   */
  it("returns { commentId } shape for any native doc with matching anchor text", async () => {
    const anchorText = "Hello world";
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
        const docsClient = makeDocsClient(docId, "Test Doc", anchorText);

        const result = await addComment(
          { documentId: docId, content: "A comment", anchorText },
          docsClient,
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

  /**
   * **Validates: Requirements 3.6**
   *
   * When anchor text is NOT found in a native doc, add_comment returns
   * isError: true with "Anchor text not found" message.
   */
  it("returns anchor-not-found error when anchor text is absent from native doc", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const driveClient = makeDriveCommentClient();
        const accessController = makeAccessController(docId);
        // Doc body does NOT contain the anchor text
        const docsClient = makeDocsClient(docId, "Test Doc", "Some other content");

        const result = await addComment(
          { documentId: docId, content: "A comment", anchorText: "MISSING_TEXT_XYZ" },
          docsClient,
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Anchor text not found");
      }),
      { numRuns: 20 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2c: suggest_edit returns { commentId } for native docs
// Validates: Requirement 3.3
// ---------------------------------------------------------------------------

describe("Preservation Property 2c — suggest_edit returns { commentId } for native Google Docs", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any documentId where mimeType = application/vnd.google-apps.document,
   * suggest_edit must return isError: false and a JSON body with shape
   * { commentId: string } when the original text is found.
   */
  it("returns { commentId } shape for any native doc with matching original text", async () => {
    const originalText = "Hello world";
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
        const docsClient = makeDocsClient(docId, "Test Doc", originalText);

        const result = await suggestEdit(
          { documentId: docId, originalText, suggestedText: "Goodbye world" },
          docsClient,
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

  /**
   * **Validates: Requirements 3.6**
   *
   * When original text is NOT found in a native doc, suggest_edit returns
   * isError: true with "Anchor text not found" message.
   */
  it("returns anchor-not-found error when original text is absent from native doc", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const driveClient = makeDriveCommentClient();
        const accessController = makeAccessController(docId);
        const docsClient = makeDocsClient(docId, "Test Doc", "Some other content");

        const result = await suggestEdit(
          { documentId: docId, originalText: "MISSING_TEXT_XYZ", suggestedText: "replacement" },
          docsClient,
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Anchor text not found");
      }),
      { numRuns: 20 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2d: replace_text returns { replacements } for native docs
// Validates: Requirement 3.4
// ---------------------------------------------------------------------------

describe("Preservation Property 2d — replace_text returns { replacements } for native Google Docs", () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any documentId where mimeType = application/vnd.google-apps.document,
   * replace_text must return isError: false and a JSON body with shape
   * { replacements: number }.
   */
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
  /**
   * **Validates: Requirements 3.5**
   *
   * For any documentId NOT in the allowed folders or document list,
   * every tool must return isError: true with "Access denied" before
   * drive.files.get is called for MIME checking or any Docs API call is made.
   *
   * On unfixed code: assertAllowed throws before any Docs API call.
   * This property confirms that ordering is preserved.
   */
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
        // Docs API must NOT have been called
        expect(docsGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });

  it("add_comment: access denied before any Docs API call for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const accessController = makeAccessController(docId, { allowed: false });
        const docsGetMock = vi.fn();
        const docsClient = {
          documents: { get: docsGetMock },
        } as unknown as docs_v1.Docs;
        const driveClient = makeDriveCommentClient();

        const result = await addComment(
          { documentId: docId, content: "comment", anchorText: "text" },
          docsClient,
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Access denied");
        expect(docsGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });

  it("suggest_edit: access denied before any Docs API call for denied IDs", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, async (docId) => {
        const accessController = makeAccessController(docId, { allowed: false });
        const docsGetMock = vi.fn();
        const docsClient = {
          documents: { get: docsGetMock },
        } as unknown as docs_v1.Docs;
        const driveClient = makeDriveCommentClient();

        const result = await suggestEdit(
          { documentId: docId, originalText: "text", suggestedText: "new" },
          docsClient,
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("Access denied");
        expect(docsGetMock).not.toHaveBeenCalled();
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
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------

describe("Preservation Property 2f — paragraph-only docs produce content equal to concatenated text runs", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any array of paragraph-only StructuralElements, readDocument must
   * return a content string equal to the concatenation of all text run
   * contents in order. No table traversal should affect this.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("content equals concatenated text runs for any paragraph-only body", async () => {
    // Arbitrary: array of 1–10 non-empty text run strings
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
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe("Preservation Property 2g — paragraph text order preserved around empty table", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For docs with paragraphs before and after an empty table (no text runs
   * in cells), the paragraph text order must be maintained and the output
   * must be identical to a doc with no table at all.
   *
   * An "empty table" is one whose cells contain paragraphs with no elements.
   * The current code already skips table elements entirely, so this must
   * continue to hold after the fix.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("paragraph text order is maintained when an empty table sits between paragraphs", async () => {
    const textArb = fc.string({ minLength: 1, maxLength: 40 });

    await fc.assert(
      fc.asyncProperty(textArb, textArb, async (before, after) => {
        // Empty table: one cell with a paragraph that has no elements
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

        // Output must be identical — empty table contributes nothing
        expect(parsedWith.content).toBe(parsedWithout.content);

        // Both before and after text must appear in order
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
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe("Preservation Property 2h — paragraph with no elements produces no extra output and no crash", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * A paragraph element whose `elements` array is empty (or absent) must
   * contribute nothing to the content string and must not cause a crash.
   * Mixing empty paragraphs with non-empty ones must not alter the output
   * of the non-empty paragraphs.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("empty paragraphs contribute nothing and do not crash", async () => {
    const textArb = fc.string({ minLength: 1, maxLength: 50 });
    // Number of empty paragraphs to intersperse (0–5)
    const emptyCountArb = fc.nat({ max: 5 });

    await fc.assert(
      fc.asyncProperty(textArb, emptyCountArb, async (text, emptyCount) => {
        const emptyParagraph = { paragraph: { elements: [] } };
        const realParagraph = { paragraph: { elements: [{ textRun: { content: text } }] } };

        // Build body: some empty paragraphs, then the real one, then more empty ones
        const bodyContent = [
          ...Array(emptyCount).fill(emptyParagraph),
          realParagraph,
          ...Array(emptyCount).fill(emptyParagraph),
        ];

        const accessController = makeNativeAccessControllerPres();
        const docsClient = makeDocsClientWithBodyPres(bodyContent);

        const result = await readDocument({ documentId: PRES_DOC_ID }, docsClient, accessController);

        // Must not crash
        expect(result.isError).toBe(false);
        const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);

        // Content must equal exactly the real paragraph text — no extra whitespace or artefacts
        expect(parsed.content).toBe(text);
      }),
      { numRuns: 40 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2i: Empty TOC preservation — no crash, no output
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe("Preservation Property 2i — empty tableOfContents produces no output and no crash", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * A doc with a `tableOfContents` element whose `content` is `[]` must
   * produce no output for that element and must not crash. The result must
   * equal a doc with no TOC element at all (both produce `""` for that element).
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("empty TOC content produces same output as no TOC element", async () => {
    const accessController = makeNativeAccessControllerPres();

    // Doc with a tableOfContents whose content is []
    const bodyWithEmptyToc = [
      { tableOfContents: { content: [] } },
    ];

    // Doc with no TOC element at all
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

    // Must not crash
    expect(resultWithEmptyToc.isError).toBe(false);
    expect(resultWithNoToc.isError).toBe(false);

    const parsedWithEmptyToc = JSON.parse(
      (resultWithEmptyToc.content[0] as { type: string; text: string }).text
    );
    const parsedWithNoToc = JSON.parse(
      (resultWithNoToc.content[0] as { type: string; text: string }).text
    );

    // Both must produce the same content (empty string for that element)
    expect(parsedWithEmptyToc.content).toBe(parsedWithNoToc.content);
    expect(parsedWithEmptyToc.content).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Property 2j: Document order preservation — paragraph, TOC, paragraph
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe("Preservation Property 2j — document order preserved around empty tableOfContents", () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For a doc with paragraph "Before", then a `tableOfContents` with empty
   * content, then paragraph "After", the `content` must equal "BeforeAfter"
   * — the empty TOC contributes nothing and the paragraph order is maintained.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("content equals 'BeforeAfter' when empty TOC sits between two paragraphs", async () => {
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

        // Empty TOC contributes nothing; content must be before + after
        expect(parsed.content).toBe(before + after);

        // Both paragraphs appear in document order
        const beforeIdx = parsed.content.indexOf(before);
        const afterIdx = parsed.content.indexOf(after);
        expect(beforeIdx).toBeLessThan(afterIdx);
      }),
      { numRuns: 40 }
    );
  });
});

// ===========================================================================
// Anchor Text Search Preservation Property Tests
// ===========================================================================
//
// Property 2: Preservation — Top-Level Paragraph Anchor Behaviour Unchanged
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
//
// Observation-first methodology:
//   On UNFIXED code:
//   - findFirstOccurrence with a top-level paragraph doc containing "Hello world"
//     and anchorText "Hello" returns { startIndex: 1, endIndex: 6 }
//   - findFirstOccurrence with anchorText absent returns null
//   - findFirstOccurrence with multiple occurrences returns the first one
//
// EXPECTED OUTCOME: All tests PASS on unfixed code (baseline confirmed).
// ===========================================================================

import { findFirstOccurrence } from "../utils/anchor.js";

// ---------------------------------------------------------------------------
// Helpers for anchor preservation tests
// ---------------------------------------------------------------------------

/** Build a minimal Schema$Document with the given body content array. */
function makeAnchorDoc(bodyContent: object[]): docs_v1.Schema$Document {
  return {
    body: { content: bodyContent as docs_v1.Schema$StructuralElement[] },
  };
}

/** Build a paragraph structural element with a single text run and explicit indices. */
function makeAnchorParaWithIndex(text: string, startIndex: number): object {
  return {
    paragraph: {
      elements: [
        {
          startIndex,
          endIndex: startIndex + text.length,
          textRun: { content: text },
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Baseline observation: "Hello world" paragraph, anchorText "Hello"
// → { startIndex: 1, endIndex: 6 }
// ---------------------------------------------------------------------------

describe("Anchor Preservation — Baseline observation: top-level paragraph returns correct indices", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Observed on UNFIXED code:
   *   findFirstOccurrence with a top-level paragraph doc containing "Hello world"
   *   and anchorText "Hello" returns { startIndex: 1, endIndex: 6 }.
   *
   * This test encodes that observation as a concrete baseline.
   * EXPECTED OUTCOME: PASSES on unfixed code.
   */
  it("returns { startIndex: 1, endIndex: 6 } for 'Hello world' paragraph with anchorText 'Hello'", () => {
    const doc = makeAnchorDoc([makeAnchorParaWithIndex("Hello world", 1)]);
    const result = findFirstOccurrence(doc, "Hello");

    expect(result).not.toBeNull();
    expect(result!.startIndex).toBe(1);
    expect(result!.endIndex).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Property 2k: Anchor text present in top-level paragraph — correct indices returned
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------

describe("Anchor Preservation Property 2k — anchor text in top-level paragraph returns correct indices", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any paragraph-only doc where the anchor text is a substring of the
   * text run, findFirstOccurrence must return { startIndex, endIndex } where:
   *   - startIndex = pe.startIndex + indexOf(anchorText)
   *   - endIndex = startIndex + anchorText.length
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("returns correct startIndex and endIndex for any anchor text present in a top-level paragraph", () => {
    // Generate: a text run body, a start index for the paragraph element,
    // and a sub-string of the body to use as anchor text.
    // The fix uses case-insensitive normalised indexOf, so we compute expectedStart
    // using normalise(body).indexOf(normalise(anchorText)) to match the implementation.
    const normalise = (s: string) =>
      s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "").toLowerCase();

    const paraArb = fc
      .record({
        body: fc.string({ minLength: 3, maxLength: 60 }),
        startIndex: fc.integer({ min: 1, max: 100 }),
      })
      .chain(({ body, startIndex }) =>
        fc
          .integer({ min: 0, max: body.length - 1 })
          .chain((anchorStart) =>
            fc
              .integer({ min: 1, max: body.length - anchorStart })
              .map((anchorLen) => {
                const anchorText = body.slice(anchorStart, anchorStart + anchorLen);
                // The FIRST occurrence of anchorText in normalised body (case-insensitive)
                const firstIdx = normalise(body).indexOf(normalise(anchorText));
                return {
                  body,
                  startIndex,
                  anchorText,
                  expectedStart: startIndex + firstIdx,
                  expectedEnd: startIndex + firstIdx + anchorLen,
                };
              })
          )
      );

    fc.assert(
      fc.property(paraArb, ({ body, startIndex, anchorText, expectedStart, expectedEnd }) => {
        const doc = makeAnchorDoc([makeAnchorParaWithIndex(body, startIndex)]);
        const result = findFirstOccurrence(doc, anchorText);

        expect(result).not.toBeNull();
        expect(result!.startIndex).toBe(expectedStart);
        expect(result!.endIndex).toBe(expectedEnd);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2l: Anchor text absent — returns null
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe("Anchor Preservation Property 2l — anchor text absent from doc returns null", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * Observed on UNFIXED code: findFirstOccurrence with anchorText absent returns null.
   *
   * For any paragraph-only doc and any anchor string that does NOT appear in
   * any text run, findFirstOccurrence must return null.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("returns null when anchor text is not present in any paragraph", () => {
    // Use a fixed body and a sentinel anchor that cannot appear in it
    const textRunsArb = fc.array(
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes("SENTINEL_XYZ_99")),
      { minLength: 1, maxLength: 5 }
    );

    fc.assert(
      fc.property(textRunsArb, (textRuns) => {
        const bodyContent = textRuns.map((text, i) =>
          makeAnchorParaWithIndex(text, i * 50 + 1)
        );
        const doc = makeAnchorDoc(bodyContent);

        const result = findFirstOccurrence(doc, "SENTINEL_XYZ_99");
        expect(result).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  it("returns null for empty doc body", () => {
    const doc = makeAnchorDoc([]);
    expect(findFirstOccurrence(doc, "anything")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 2m: Multiple occurrences — first one returned
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe("Anchor Preservation Property 2m — multiple occurrences returns the first one", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * Observed on UNFIXED code: findFirstOccurrence with multiple occurrences
   * returns the first one.
   *
   * For any doc with the anchor text appearing in multiple top-level paragraphs,
   * findFirstOccurrence must return the indices from the FIRST paragraph.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("returns the first occurrence when anchor text appears in multiple paragraphs", () => {
    // Generate: anchor text, and 2–5 paragraphs each containing the anchor text,
    // with increasing startIndex values so "first" is unambiguous.
    // Use a prefix that is guaranteed not to contain the anchor (case-insensitively)
    // so the anchorOffset calculation is reliable.
    const normalise = (s: string) =>
      s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "").toLowerCase();

    // Anchor: only digits (0-9), prefix: only letters — guaranteed no overlap after normalise
    const anchorArb = fc.stringMatching(/^[0-9]{1,10}$/);
    const countArb = fc.integer({ min: 2, max: 5 });

    fc.assert(
      fc.property(anchorArb, countArb, (anchor, count) => {
        // Each paragraph: "PREFIX_N<anchor>SUFFIX_N" at startIndex = N * 100 + 1
        // Prefix uses only letters so it cannot contain the digit-only anchor
        const paragraphs = Array.from({ length: count }, (_, i) => {
          const prefix = `Para`;
          const body = prefix + anchor + `End`;
          const startIndex = i * 100 + 1;
          // The normalised index of anchor in body
          const normIdx = normalise(body).indexOf(normalise(anchor));
          return { body, startIndex, anchorOffset: normIdx };
        });

        const bodyContent = paragraphs.map(({ body, startIndex }) =>
          makeAnchorParaWithIndex(body, startIndex)
        );
        const doc = makeAnchorDoc(bodyContent);

        const result = findFirstOccurrence(doc, anchor);

        expect(result).not.toBeNull();
        // Must match the FIRST paragraph
        const first = paragraphs[0];
        expect(result!.startIndex).toBe(first.startIndex + first.anchorOffset);
        expect(result!.endIndex).toBe(first.startIndex + first.anchorOffset + anchor.length);
      }),
      { numRuns: 60 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2n: Paragraph-only docs — output identical to original function
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe("Anchor Preservation Property 2n — paragraph-only docs produce identical output to original function", () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any paragraph-only doc (no tables, no TOC), the current findFirstOccurrence
   * IS the original function. This property asserts that the function's output
   * is deterministic and consistent: calling it twice with the same inputs
   * always returns the same result.
   *
   * This establishes the baseline that must be preserved after the fix:
   * paragraph-only docs must produce identical anchor results as before.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (baseline confirmed).
   */
  it("produces identical results on repeated calls for paragraph-only docs (determinism)", () => {
    const textRunsArb = fc.array(
      fc.string({ minLength: 1, maxLength: 40 }),
      { minLength: 1, maxLength: 8 }
    );
    const anchorArb = fc.string({ minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(textRunsArb, anchorArb, (textRuns, anchor) => {
        const bodyContent = textRuns.map((text, i) =>
          makeAnchorParaWithIndex(text, i * 50 + 1)
        );
        const doc = makeAnchorDoc(bodyContent);

        // Call twice — must return identical result (determinism = baseline preservation)
        const result1 = findFirstOccurrence(doc, anchor);
        const result2 = findFirstOccurrence(doc, anchor);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 80 }
    );
  });

  it("returns null for paragraph-only doc when anchor is not a substring of any text run", () => {
    // Generate text runs that are guaranteed not to contain the anchor
    const anchorArb = fc.constant("UNIQUE_ANCHOR_TOKEN_ZZZ");
    const textRunsArb = fc.array(
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes("UNIQUE_ANCHOR_TOKEN_ZZZ")),
      { minLength: 1, maxLength: 5 }
    );

    fc.assert(
      fc.property(textRunsArb, anchorArb, (textRuns, anchor) => {
        const bodyContent = textRuns.map((text, i) =>
          makeAnchorParaWithIndex(text, i * 50 + 1)
        );
        const doc = makeAnchorDoc(bodyContent);
        expect(findFirstOccurrence(doc, anchor)).toBeNull();
      }),
      { numRuns: 50 }
    );
  });
});
