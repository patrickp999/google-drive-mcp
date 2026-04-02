import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function suggestEdit(
  args: { documentId: string; originalText: string; suggestedText: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertNativeDoc(args.documentId);

    // Note: Google Drive API anchor fields are ignored for Google Workspace files.
    // Anchored comments always appear as "Original content deleted" regardless of
    // anchor format used. We prepend the originalText as context in the comment body instead.
    const body = `Re: "${args.originalText}"\n\nSuggested edit: replace with "${args.suggestedText}"`;

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
