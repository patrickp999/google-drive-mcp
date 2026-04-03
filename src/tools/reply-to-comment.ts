import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function replyToComment(
  args: { documentId: string; commentId: string; content: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    const reply = await driveClient.replies.create({
      fileId: args.documentId,
      commentId: args.commentId,
      fields: "id",
      requestBody: { content: args.content },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ replyId: reply.data.id }) }],
      isError: false,
    };
  });
}

export const replyToCommentToolDefinition = {
  name: "reply_to_comment",
  description: "Reply to an existing comment on a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      commentId: { type: "string", description: "The ID of the comment to reply to" },
      content: { type: "string", description: "The text content of the reply" },
    },
    required: ["documentId", "commentId", "content"],
  },
};
