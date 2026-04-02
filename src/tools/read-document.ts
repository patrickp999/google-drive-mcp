import { docs_v1 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function readDocument(
  args: { documentId: string },
  docsClient: docs_v1.Docs,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertNativeDoc(args.documentId);

    const doc = await docsClient.documents.get({ documentId: args.documentId });

    function collectText(elements: docs_v1.Schema$StructuralElement[]): string {
      let result = "";
      for (const element of elements) {
        if (element.paragraph !== undefined) {
          for (const pe of element.paragraph.elements ?? []) {
            result += pe.textRun?.content ?? "";
          }
        } else if (element.table !== undefined) {
          for (const row of element.table.tableRows ?? []) {
            for (const cell of row.tableCells ?? []) {
              result += collectText(cell.content ?? []);
            }
          }
        } else if (element.tableOfContents !== undefined) {
          result += collectText(element.tableOfContents.content ?? []);
        }
      }
      return result;
    }

    const content = collectText(doc.data.body?.content ?? []);

    const title = doc.data.title ?? "";

    return {
      content: [{ type: "text", text: JSON.stringify({ title, content }) }],
      isError: false,
    };
  });
}

export const readDocumentToolDefinition = {
  name: "read_document",
  description: "Read the full text content of a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
    },
    required: ["documentId"],
  },
};
