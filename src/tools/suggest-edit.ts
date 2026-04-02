import { docs_v1, drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { findFirstOccurrence, buildCommentAnchor } from "../utils/anchor.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function suggestEdit(
  args: { documentId: string; originalText: string; suggestedText: string },
  docsClient: docs_v1.Docs,
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertNativeDoc(args.documentId);

    // Step 1: Fetch doc and locate original text
    const doc = await docsClient.documents.get({ documentId: args.documentId });
    const occurrence = findFirstOccurrence(doc.data, args.originalText);

    if (!occurrence) {
      return {
        content: [{ type: "text", text: `Anchor text not found in document: '${args.originalText}'` }],
        isError: true,
      };
    }

    // Step 2: Post a comment anchored to the original text — document content is NOT modified
    const res = await driveClient.comments.create({
      fileId: args.documentId,
      fields: "id",
      requestBody: {
        content: `Suggested edit: replace with '${args.suggestedText}'`,
        anchor: buildCommentAnchor(occurrence.startIndex, occurrence.endIndex),
        quotedFileContent: {
          mimeType: "text/plain",
          value: args.originalText,
        },
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ commentId: res.data.id }) }],
      isError: false,
    };
  });
}

export const suggestEditToolDefinition = {
  name: "suggest_edit",
  description: "Propose a text change as a comment in a Google Doc (document owner can review and apply manually)",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      originalText: { type: "string", description: "The text to be replaced" },
      suggestedText: { type: "string", description: "The suggested replacement text" },
    },
    required: ["documentId", "originalText", "suggestedText"],
  },
};
