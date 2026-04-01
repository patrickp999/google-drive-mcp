import { docs_v1 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function replaceText(
  args: { documentId: string; findText: string; replaceText: string },
  docsClient: docs_v1.Docs,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    const res = await docsClient.documents.batchUpdate({
      documentId: args.documentId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: args.findText, matchCase: true },
              replaceText: args.replaceText,
            },
          },
        ],
      },
    });

    const replacements =
      res.data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;

    return {
      content: [{ type: "text", text: JSON.stringify({ replacements }) }],
      isError: false,
    };
  });
}

export const replaceTextToolDefinition = {
  name: "replace_text",
  description: "Find and replace text within a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      findText: { type: "string", description: "Text to find" },
      replaceText: { type: "string", description: "Text to replace with" },
    },
    required: ["documentId", "findText", "replaceText"],
  },
};
