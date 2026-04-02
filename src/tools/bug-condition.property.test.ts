/**
 * Property 1: Bug Condition — Non-Native File Passed to Document Tool
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7
 *
 * These tests were written BEFORE the fix to confirm the bug exists.
 * On UNFIXED code: tests FAIL (tools return generic 400 error, Docs API IS called).
 * On FIXED code: tests PASS (tools return actionable error, Docs API NOT called).
 *
 * EXPECTED OUTCOME (after fix): Tests PASS
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

const ALLOWED_FOLDER = "allowed-folder-id";
const NATIVE_MIME = "application/vnd.google-apps.document";

const NON_NATIVE_MIMES = [
  "application/vnd.google-apps.shortcut",
  "application/vnd.google-apps.spreadsheet",
  "application/pdf",
  "application/vnd.google-apps.presentation",
];

function makeAccessControllerWithMime(
  docId: string,
  mimeType: string,
  fileName = "My Shortcut File"
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
          name: fileName,
          mimeType,
          parents: [ALLOWED_FOLDER],
        },
      }),
    },
  } as unknown as drive_v3.Drive;

  return new AccessController(config, driveClient);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const docIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{10,44}$/);
const fileNameArb = fc.string({ minLength: 1, maxLength: 80 });
const nonNativeMimeArb = fc.constantFrom(...NON_NATIVE_MIMES);

// ---------------------------------------------------------------------------
// Property 1a: read_document returns actionable error for non-native files
// Validates: Requirements 1.1, 2.1, 2.5, 2.7
// ---------------------------------------------------------------------------

describe("Bug Condition Property 1a — read_document returns actionable error for non-native files", () => {
  /**
   * **Validates: Requirements 2.1, 2.5, 2.7**
   *
   * For any documentId where mimeType != application/vnd.google-apps.document,
   * read_document must return isError: true with the actionable error message
   * containing the filename and document ID, and must NOT call the Docs API.
   */
  it("returns actionable error and does NOT call Docs API for any non-native MIME type", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, nonNativeMimeArb, fileNameArb, async (docId, mimeType, fileName) => {
        const accessController = makeAccessControllerWithMime(docId, mimeType, fileName);
        const docsGetMock = vi.fn();
        const docsClient = {
          documents: { get: docsGetMock },
        } as unknown as docs_v1.Docs;

        const result = await readDocument({ documentId: docId }, docsClient, accessController);

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("is not a native Google Doc");
        expect(text).toContain(fileName);
        expect(text).toContain(docId);
        // Docs API must NOT have been called
        expect(docsGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1b: add_comment returns actionable error for non-native files
// Validates: Requirements 1.2, 2.2, 2.5, 2.7
// ---------------------------------------------------------------------------

describe("Bug Condition Property 1b — add_comment returns actionable error for non-native files", () => {
  /**
   * **Validates: Requirements 2.2, 2.5, 2.7**
   *
   * For any documentId where mimeType != application/vnd.google-apps.document,
   * add_comment must return isError: true with the actionable error message
   * and must NOT call the Docs API.
   */
  it("returns actionable error and does NOT call Docs API for any non-native MIME type", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, nonNativeMimeArb, fileNameArb, async (docId, mimeType, fileName) => {
        const accessController = makeAccessControllerWithMime(docId, mimeType, fileName);
        const docsGetMock = vi.fn();
        const docsClient = {
          documents: { get: docsGetMock },
        } as unknown as docs_v1.Docs;
        const driveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: { id: docId, name: fileName, mimeType, parents: [ALLOWED_FOLDER] },
            }),
          },
          comments: { create: vi.fn() },
        } as unknown as drive_v3.Drive;

        const result = await addComment(
          { documentId: docId, content: "A comment", anchorText: "some text" },
          docsClient,
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("is not a native Google Doc");
        expect(text).toContain(fileName);
        expect(text).toContain(docId);
        expect(docsGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1c: replace_text returns actionable error for non-native files
// Validates: Requirements 1.4, 2.4, 2.5, 2.7
// ---------------------------------------------------------------------------

describe("Bug Condition Property 1c — replace_text returns actionable error for non-native files", () => {
  /**
   * **Validates: Requirements 2.4, 2.5, 2.7**
   *
   * For any documentId where mimeType != application/vnd.google-apps.document,
   * replace_text must return isError: true with the actionable error message
   * and must NOT call the Docs API.
   */
  it("returns actionable error and does NOT call Docs API for any non-native MIME type", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, nonNativeMimeArb, fileNameArb, async (docId, mimeType, fileName) => {
        const accessController = makeAccessControllerWithMime(docId, mimeType, fileName);
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
        expect(text).toContain("is not a native Google Doc");
        expect(text).toContain(fileName);
        expect(text).toContain(docId);
        expect(batchUpdateMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1d: suggest_edit returns actionable error for shortcut in allowed folder
// Validates: Requirements 1.3, 2.3, 2.5, 2.7
// ---------------------------------------------------------------------------

describe("Bug Condition Property 1d — suggest_edit returns actionable error for shortcut in allowed folder", () => {
  /**
   * **Validates: Requirements 2.3, 2.5, 2.7**
   *
   * For a shortcut file whose parent IS in allowedFolderIds,
   * suggest_edit must return isError: true with the actionable error message
   * and must NOT call the Docs API.
   */
  it("returns actionable error for shortcut in allowed folder and does NOT call Docs API", async () => {
    await fc.assert(
      fc.asyncProperty(docIdArb, fileNameArb, async (docId, fileName) => {
        const accessController = makeAccessControllerWithMime(
          docId,
          "application/vnd.google-apps.shortcut",
          fileName
        );
        const docsGetMock = vi.fn();
        const docsClient = {
          documents: { get: docsGetMock },
        } as unknown as docs_v1.Docs;
        const driveClient = {
          files: {
            get: vi.fn().mockResolvedValue({
              data: {
                id: docId,
                name: fileName,
                mimeType: "application/vnd.google-apps.shortcut",
                parents: [ALLOWED_FOLDER],
              },
            }),
          },
          comments: { create: vi.fn() },
        } as unknown as drive_v3.Drive;

        const result = await suggestEdit(
          { documentId: docId, originalText: "some text", suggestedText: "new text" },
          docsClient,
          driveClient,
          accessController
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: string; text: string }).text;
        expect(text).toContain("is not a native Google Doc");
        expect(text).toContain(fileName);
        expect(text).toContain(docId);
        expect(docsGetMock).not.toHaveBeenCalled();
      }),
      { numRuns: 30 }
    );
  });
});

// ===========================================================================
// Table Extraction Bug Condition Tests
// ===========================================================================
//
// Property 1 (Table Extraction): Bug Condition — Table Cell Text Is Extracted
//
// Validates: Requirements 2.1, 2.2, 2.3
//
// These tests are written BEFORE the fix to confirm the bug exists.
// On UNFIXED code: tests FAIL (table cell text is absent from content).
// On FIXED code: tests PASS.
//
// EXPECTED OUTCOME (on unfixed code): Tests FAIL — this is correct and proves the bug.
// ===========================================================================

// ---------------------------------------------------------------------------
// Helpers for table extraction tests
// ---------------------------------------------------------------------------

const NATIVE_MIME_TABLE = "application/vnd.google-apps.document";
const ALLOWED_FOLDER_TABLE = "allowed-folder-id";
const TABLE_DOC_ID = "table-test-doc-id-1234";

function makeNativeAccessController(): AccessController {
  const config = {
    allowedFolderIds: new Set([ALLOWED_FOLDER_TABLE]),
    allowedDocIds: new Set<string>(),
    googleClientId: "fake-client-id",
    googleClientSecret: "fake-client-secret",
  };
  const driveClient = {
    files: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: TABLE_DOC_ID,
          name: "Test Doc",
          mimeType: NATIVE_MIME_TABLE,
          parents: [ALLOWED_FOLDER_TABLE],
        },
      }),
    },
  } as unknown as drive_v3.Drive;
  return new AccessController(config, driveClient);
}

/** Build a Docs API mock that returns the given body content array. */
function makeDocsClientWithBody(bodyContent: object[]): docs_v1.Docs {
  return {
    documents: {
      get: vi.fn().mockResolvedValue({
        data: {
          title: "Test Doc",
          body: { content: bodyContent },
        },
      }),
    },
  } as unknown as docs_v1.Docs;
}

/** Helper: build a paragraph structural element. */
function makeParagraph(text: string): object {
  return {
    paragraph: {
      elements: [{ textRun: { content: text } }],
    },
  };
}

/** Helper: build a table structural element with given rows of cell texts. */
function makeTable(rows: string[][]): object {
  return {
    table: {
      tableRows: rows.map((cells) => ({
        tableCells: cells.map((cellText) => ({
          content: [makeParagraph(cellText)],
        })),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Test Case 1 — Table-only doc
// Validates: Requirements 2.1, 2.3
// ---------------------------------------------------------------------------

describe("Table Extraction Bug Condition — Test Case 1: table-only doc", () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * Doc body has a single table with one cell containing "Alice".
   * Assert content contains "Alice".
   * On UNFIXED code: FAILS — content is "".
   */
  it("extracts text from a single-cell table (will fail on unfixed code)", async () => {
    const accessController = makeNativeAccessController();
    const bodyContent = [makeTable([["Alice"]])];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.content).toContain("Alice");
  });
});

// ---------------------------------------------------------------------------
// Test Case 2 — Mixed doc (paragraphs + table)
// Validates: Requirements 2.2, 2.3
// ---------------------------------------------------------------------------

describe("Table Extraction Bug Condition — Test Case 2: mixed doc", () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * Doc body: paragraph "Header", then table cell "Row1Col1", then paragraph "Footer".
   * Assert content contains all three strings.
   * On UNFIXED code: FAILS — "Row1Col1" is absent.
   */
  it("extracts text from paragraphs and table cells in a mixed doc (will fail on unfixed code)", async () => {
    const accessController = makeNativeAccessController();
    const bodyContent = [
      makeParagraph("Header"),
      makeTable([["Row1Col1"]]),
      makeParagraph("Footer"),
    ];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.content).toContain("Header");
    expect(parsed.content).toContain("Row1Col1");
    expect(parsed.content).toContain("Footer");
  });
});

// ---------------------------------------------------------------------------
// Test Case 3 — Multi-row table (3 rows × 2 columns)
// Validates: Requirements 2.1, 2.3
// ---------------------------------------------------------------------------

describe("Table Extraction Bug Condition — Test Case 3: multi-row table", () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * Table with 3 rows × 2 columns, each cell a unique string.
   * Assert all 6 strings appear in content in row-major order.
   * On UNFIXED code: FAILS — all cell text is absent.
   */
  it("extracts all 6 cell texts from a 3×2 table in row-major order (will fail on unfixed code)", async () => {
    const cells = [
      ["R0C0", "R0C1"],
      ["R1C0", "R1C1"],
      ["R2C0", "R2C1"],
    ];
    const accessController = makeNativeAccessController();
    const bodyContent = [makeTable(cells)];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);

    // All 6 unique cell strings must be present
    for (const row of cells) {
      for (const cellText of row) {
        expect(parsed.content).toContain(cellText);
      }
    }

    // Row-major order: R0C0 before R0C1 before R1C0 before R1C1 before R2C0 before R2C1
    const allCellTexts = cells.flat();
    let lastIndex = -1;
    for (const cellText of allCellTexts) {
      const idx = parsed.content.indexOf(cellText);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Case 4 — Empty cell edge case
// Validates: Requirements 2.3 (no crash), 3.3
// ---------------------------------------------------------------------------

describe("Table Extraction Bug Condition — Test Case 4: empty cell edge case", () => {
  /**
   * **Validates: Requirements 2.3, 3.3**
   *
   * Table cell with no text runs alongside a paragraph with text.
   * Assert no crash and paragraph text is present.
   * This may PASS on unfixed code (empty cell is not the root cause).
   */
  it("does not crash on empty table cell and still returns paragraph text", async () => {
    const accessController = makeNativeAccessController();
    const emptyCell = { content: [{ paragraph: { elements: [] } }] };
    const bodyContent = [
      makeParagraph("ParagraphText"),
      {
        table: {
          tableRows: [
            {
              tableCells: [
                emptyCell,
                { content: [makeParagraph("CellWithText")] },
              ],
            },
          ],
        },
      },
    ];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    // Must not crash
    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    // Paragraph text must always be present (even on unfixed code)
    expect(parsed.content).toContain("ParagraphText");
  });
});


// ===========================================================================
// TOC Extraction Bug Condition Tests
// ===========================================================================
//
// Property 1 (TOC Extraction): Bug Condition — TOC Entry Text Is Extracted
//
// Validates: Requirements 2.1, 2.2, 2.3
//
// These tests are written BEFORE the fix to confirm the bug exists.
// On UNFIXED code: tests 1-3 FAIL (TOC text is absent from content).
// On FIXED code: tests PASS.
//
// EXPECTED OUTCOME (on unfixed code): Tests 1-3 FAIL — this is correct and proves the bug.
// ===========================================================================

// ---------------------------------------------------------------------------
// Helper: build a tableOfContents structural element
// ---------------------------------------------------------------------------

/** Build a tableOfContents structural element with the given entry strings. */
function makeToc(entries: string[]): object {
  return {
    tableOfContents: {
      content: entries.map((entry) => makeParagraph(entry)),
    },
  };
}

// ---------------------------------------------------------------------------
// Test Case 1 — TOC-only doc
// Validates: Requirements 2.1, 2.3
// ---------------------------------------------------------------------------

describe("TOC Extraction Bug Condition — Test Case 1: TOC-only doc", () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * Doc body has a single tableOfContents with one entry "Introduction".
   * Assert content contains "Introduction".
   * On UNFIXED code: FAILS — content is "".
   */
  it("extracts text from a single-entry TOC (will fail on unfixed code)", async () => {
    const accessController = makeNativeAccessController();
    const bodyContent = [makeToc(["Introduction"])];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.content).toContain("Introduction");
  });
});

// ---------------------------------------------------------------------------
// Test Case 2 — TOC + paragraph doc
// Validates: Requirements 2.2, 2.3
// ---------------------------------------------------------------------------

describe("TOC Extraction Bug Condition — Test Case 2: TOC + paragraph doc", () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * Doc body: tableOfContents entry "Overview", then paragraph "Body text".
   * Assert content contains both strings.
   * On UNFIXED code: FAILS — "Overview" is absent.
   */
  it("extracts text from both TOC entry and paragraph in a mixed doc (will fail on unfixed code)", async () => {
    const accessController = makeNativeAccessController();
    const bodyContent = [
      makeToc(["Overview"]),
      makeParagraph("Body text"),
    ];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.content).toContain("Overview");
    expect(parsed.content).toContain("Body text");
  });
});

// ---------------------------------------------------------------------------
// Test Case 3 — Multi-entry TOC
// Validates: Requirements 2.1, 2.3
// ---------------------------------------------------------------------------

describe("TOC Extraction Bug Condition — Test Case 3: multi-entry TOC", () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * TOC with three entries "Intro", "Methods", "Results".
   * Assert all three appear in content in order.
   * On UNFIXED code: FAILS — all TOC text is absent.
   */
  it("extracts all three TOC entries in order (will fail on unfixed code)", async () => {
    const entries = ["Intro", "Methods", "Results"];
    const accessController = makeNativeAccessController();
    const bodyContent = [makeToc(entries)];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);

    // All three entries must be present
    for (const entry of entries) {
      expect(parsed.content).toContain(entry);
    }

    // Must appear in document order: Intro before Methods before Results
    let lastIndex = -1;
    for (const entry of entries) {
      const idx = parsed.content.indexOf(entry);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Case 4 — Empty TOC edge case
// Validates: Requirements 3.3 (no crash)
// ---------------------------------------------------------------------------

describe("TOC Extraction Bug Condition — Test Case 4: empty TOC edge case", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * tableOfContents element with content: [].
   * Assert no crash and no extra output.
   * This may PASS on unfixed code — empty content is not the root cause.
   */
  it("does not crash on empty TOC and produces no extra output", async () => {
    const accessController = makeNativeAccessController();
    const bodyContent = [
      { tableOfContents: { content: [] } },
    ];
    const docsClient = makeDocsClientWithBody(bodyContent);

    const result = await readDocument({ documentId: TABLE_DOC_ID }, docsClient, accessController);

    // Must not crash
    expect(result.isError).toBe(false);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    // Empty TOC should contribute nothing to content
    expect(parsed.content).toBe("");
  });
});


// ===========================================================================
// Anchor Text Search Bug Condition Tests
// ===========================================================================
//
// Property 1 (Anchor Text Search): Bug Condition — Anchor Text Found in Table,
// TOC, or Case/Char Variant
//
// Validates: Requirements 1.1, 1.2, 1.3, 1.4
//
// These tests call `findFirstOccurrence` directly with mock docs.
// On UNFIXED code: tests FAIL (findFirstOccurrence returns null).
// On FIXED code: tests PASS.
//
// EXPECTED OUTCOME (on unfixed code): Tests FAIL — this is correct and proves the bug.
// ===========================================================================

import { findFirstOccurrence } from "../utils/anchor.js";

/** Build a minimal Schema$Document with the given body content array. */
function makeDoc(bodyContent: object[]): docs_v1.Schema$Document {
  return {
    body: { content: bodyContent as docs_v1.Schema$StructuralElement[] },
  };
}

/** Build a paragraph structural element with a single text run. */
function makeAnchorParagraph(text: string, startIndex = 1): object {
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

/** Build a table structural element with a single cell containing the given text. */
function makeAnchorTable(cellText: string): object {
  return {
    table: {
      tableRows: [
        {
          tableCells: [
            {
              content: [makeAnchorParagraph(cellText, 1)],
            },
          ],
        },
      ],
    },
  };
}

/** Build a tableOfContents structural element with a single entry. */
function makeAnchorToc(entryText: string): object {
  return {
    tableOfContents: {
      content: [makeAnchorParagraph(entryText, 1)],
    },
  };
}

// ---------------------------------------------------------------------------
// Test Case 1 — Anchor text in table cell
// Validates: Requirement 1.1
// ---------------------------------------------------------------------------

describe("Anchor Text Search Bug Condition — Test Case 1: anchor in table cell", () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * Doc has a single table cell containing "Alice".
   * findFirstOccurrence(doc, "Alice") should return non-null { startIndex, endIndex }.
   * On UNFIXED code: FAILS — returns null because flat iteration skips table elements.
   */
  it("finds anchor text inside a table cell (will fail on unfixed code)", () => {
    const doc = makeDoc([makeAnchorTable("Alice")]);
    const result = findFirstOccurrence(doc, "Alice");

    // Counterexample on unfixed code: result is null
    expect(result).not.toBeNull();
    expect(result!.endIndex - result!.startIndex).toBe("Alice".length);
  });
});

// ---------------------------------------------------------------------------
// Test Case 2 — Anchor text in TOC entry
// Validates: Requirement 1.2
// ---------------------------------------------------------------------------

describe("Anchor Text Search Bug Condition — Test Case 2: anchor in TOC entry", () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * Doc has a tableOfContents entry "Introduction".
   * findFirstOccurrence(doc, "Introduction") should return non-null { startIndex, endIndex }.
   * On UNFIXED code: FAILS — returns null because TOC branch is never visited.
   */
  it("finds anchor text inside a TOC entry (will fail on unfixed code)", () => {
    const doc = makeDoc([makeAnchorToc("Introduction")]);
    const result = findFirstOccurrence(doc, "Introduction");

    // Counterexample on unfixed code: result is null
    expect(result).not.toBeNull();
    expect(result!.endIndex - result!.startIndex).toBe("Introduction".length);
  });
});

// ---------------------------------------------------------------------------
// Test Case 3 — Case-insensitive match
// Validates: Requirement 1.3
// ---------------------------------------------------------------------------

describe("Anchor Text Search Bug Condition — Test Case 3: case-insensitive match", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * Doc paragraph contains "Profile Summary". Caller passes anchorText "PROFILE SUMMARY".
   * findFirstOccurrence(doc, "PROFILE SUMMARY") should return non-null { startIndex, endIndex }.
   * On UNFIXED code: FAILS — case-sensitive includes() finds no match.
   */
  it("finds anchor text with case-insensitive matching (will fail on unfixed code)", () => {
    const anchorText = "PROFILE SUMMARY";
    const doc = makeDoc([makeAnchorParagraph("Profile Summary", 1)]);
    const result = findFirstOccurrence(doc, anchorText);

    // Counterexample on unfixed code: result is null
    expect(result).not.toBeNull();
    expect(result!.endIndex - result!.startIndex).toBe(anchorText.length);
  });
});

// ---------------------------------------------------------------------------
// Test Case 4 — Zero-width character stripping
// Validates: Requirement 1.4
// ---------------------------------------------------------------------------

describe("Anchor Text Search Bug Condition — Test Case 4: zero-width character stripping", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * Doc text run contains "Hello\u200BWorld" (zero-width space between Hello and World).
   * Caller passes anchorText "HelloWorld".
   * findFirstOccurrence(doc, "HelloWorld") should return non-null { startIndex, endIndex }.
   * On UNFIXED code: FAILS — raw string comparison does not strip zero-width chars.
   */
  it("finds anchor text after stripping zero-width characters (will fail on unfixed code)", () => {
    const anchorText = "HelloWorld";
    const doc = makeDoc([makeAnchorParagraph("Hello\u200BWorld", 1)]);
    const result = findFirstOccurrence(doc, anchorText);

    // Counterexample on unfixed code: result is null
    expect(result).not.toBeNull();
    expect(result!.endIndex - result!.startIndex).toBe(anchorText.length);
  });
});
