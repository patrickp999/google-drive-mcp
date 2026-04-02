import { docs_v1 } from "googleapis";

function normalise(s: string): string {
  return s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "").toLowerCase();
}

function searchElements(
  elements: docs_v1.Schema$StructuralElement[],
  text: string
): { startIndex: number; endIndex: number } | null {
  const normText = normalise(text);
  for (const element of elements) {
    if (element.paragraph !== undefined) {
      for (const pe of element.paragraph.elements ?? []) {
        const textRun = pe.textRun;
        if (textRun?.content !== undefined) {
          const normRun = normalise(textRun.content ?? "");
          const idx = normRun.indexOf(normText);
          if (idx >= 0) {
            const startIndex = pe.startIndex! + idx;
            const endIndex = startIndex + text.length;
            return { startIndex, endIndex };
          }
        }
      }
    } else if (element.table !== undefined) {
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          const result = searchElements(cell.content ?? [], text);
          if (result !== null) return result;
        }
      }
    } else if (element.tableOfContents !== undefined) {
      const result = searchElements(element.tableOfContents.content ?? [], text);
      if (result !== null) return result;
    }
  }
  return null;
}

export function findFirstOccurrence(
  doc: docs_v1.Schema$Document,
  text: string
): { startIndex: number; endIndex: number } | null {
  return searchElements(doc.body?.content ?? [], text);
}

// NOTE: The Drive API comment anchor format is poorly documented and may behave
// differently than expected. This structure is based on available documentation
// and should be validated against real API behavior during testing.
// Treat this as a starting point, not a contract.
export function buildCommentAnchor(startIndex: number, endIndex: number): string {
  return JSON.stringify({
    r: "head",
    a: [{ line: "real", cl: { unit: "characters", vs: startIndex, ve: endIndex } }],
  });
}
