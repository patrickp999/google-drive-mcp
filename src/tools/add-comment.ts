import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function addComment(
  args: { documentId: string; content: string; anchorText: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertNativeDoc(args.documentId);

    // Note: Google Drive API anchor fields are ignored for Google Workspace files.
    // Anchored comments always appear as "Original content deleted" regardless of
    // anchor format used. We prepend the anchorText as context in the comment body instead.
    const body = `Re: "${args.anchorText}"\n\n${args.content}`;

    const res = await driveClient.comments.create({
      fileId: args.documentId,
      fields: "id",
      requestBody: { content: body },
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
