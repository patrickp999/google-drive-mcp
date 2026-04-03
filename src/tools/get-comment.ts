import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function getComment(
  args: { documentId: string; commentId: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    const res = await driveClient.comments.get({
      fileId: args.documentId,
      commentId: args.commentId,
      fields: "id,author,content,createdTime,resolved,replies(id,author,content,createdTime)",
    });

    const comment = res.data;

    const mapped = {
      id: comment.id,
      author: comment.author?.displayName,
      content: comment.content,
      createdTime: comment.createdTime,
      resolved: comment.resolved,
      replies: (comment.replies ?? []).map((reply) => ({
        id: reply.id,
        author: reply.author?.displayName,
        content: reply.content,
        createdTime: reply.createdTime,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      isError: false,
    };
  });
}

export const getCommentToolDefinition = {
  name: "get_comment",
  description: "Get a specific comment and its replies from a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      commentId: { type: "string", description: "The ID of the comment to retrieve" },
    },
    required: ["documentId", "commentId"],
  },
};
