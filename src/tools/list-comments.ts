import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function listComments(
  args: { documentId: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    const res = await driveClient.comments.list({
      fileId: args.documentId,
      fields: "comments(id,author,content,createdTime,resolved)",
      pageSize: 100,
    });

    const comments = res.data.comments ?? [];

    if (comments.length === 0) {
      return {
        content: [{ type: "text", text: "No comments found." }],
        isError: false,
      };
    }

    const mapped = comments.map((comment) => ({
      id: comment.id,
      author: comment.author?.displayName,
      content: comment.content,
      createdTime: comment.createdTime,
      resolved: comment.resolved,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      isError: false,
    };
  });
}

export const listCommentsToolDefinition = {
  name: "list_comments",
  description: "List all comments on a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
    },
    required: ["documentId"],
  },
};
