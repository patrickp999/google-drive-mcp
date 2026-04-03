import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function deleteComment(
  args: { documentId: string; commentId: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    await driveClient.comments.delete({
      fileId: args.documentId,
      commentId: args.commentId,
    });

    return {
      content: [{ type: "text", text: `Comment ${args.commentId} deleted successfully.` }],
      isError: false,
    };
  });
}

export const deleteCommentToolDefinition = {
  name: "delete_comment",
  description: "Delete a comment from a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      commentId: { type: "string", description: "The ID of the comment to delete" },
    },
    required: ["documentId", "commentId"],
  },
};
