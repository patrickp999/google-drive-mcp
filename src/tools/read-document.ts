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
    await accessController.assertAllowed(args.documentId);

    const doc = await docsClient.documents.get({ documentId: args.documentId });

    let content = "";
    for (const element of doc.data.body?.content ?? []) {
      for (const pe of element.paragraph?.elements ?? []) {
        content += pe.textRun?.content ?? "";
      }
    }

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
