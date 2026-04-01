import { docs_v1 } from "googleapis";

export function findFirstOccurrence(
  doc: docs_v1.Schema$Document,
  text: string
): { startIndex: number; endIndex: number } | null {
  for (const element of doc.body?.content ?? []) {
    for (const pe of element.paragraph?.elements ?? []) {
      const textRun = pe.textRun;
      if (textRun?.content?.includes(text)) {
        const startIndex = pe.startIndex! + textRun.content!.indexOf(text);
        const endIndex = startIndex + text.length;
        return { startIndex, endIndex };
      }
    }
  }
  return null;
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
