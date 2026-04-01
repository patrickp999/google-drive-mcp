import { docs_v1, drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { findFirstOccurrence, buildCommentAnchor } from "../utils/anchor.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function addComment(
  args: { documentId: string; content: string; anchorText: string },
  docsClient: docs_v1.Docs,
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    // Step 1: Fetch doc and locate anchor text
    const doc = await docsClient.documents.get({ documentId: args.documentId });
    const occurrence = findFirstOccurrence(doc.data, args.anchorText);

    if (!occurrence) {
      return {
        content: [{ type: "text", text: `Anchor text not found in document: '${args.anchorText}'` }],
        isError: true,
      };
    }

    // Step 2: Create comment anchored to the located text range
    const res = await driveClient.comments.create({
      fileId: args.documentId,
      fields: "id",
      requestBody: {
        content: args.content,
        anchor: buildCommentAnchor(occurrence.startIndex, occurrence.endIndex),
        quotedFileContent: {
          mimeType: "text/plain",
          value: args.anchorText,
        },
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ commentId: res.data.id }) }],
      isError: false,
    };
  });
}

export const addCommentToolDefinition = {
  name: "add_comment",
  description: "Add a comment anchored to specific text in a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      content: { type: "string", description: "The comment text" },
      anchorText: { type: "string", description: "The text in the document to anchor the comment to" },
    },
    required: ["documentId", "content", "anchorText"],
  },
};
