import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function resolveComment(
  args: { documentId: string; commentId: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    const reply = await driveClient.replies.create({
      fileId: args.documentId,
      commentId: args.commentId,
      fields: "id",
      requestBody: { action: "resolve" },
    });

    return {
      content: [{ type: "text", text: `Comment ${args.commentId} resolved successfully. Reply ID: ${reply.data.id}` }],
      isError: false,
    };
  });
}

export const resolveCommentToolDefinition = {
  name: "resolve_comment",
  description: "Resolve an existing comment on a Google Doc",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID" },
      commentId: { type: "string", description: "The ID of the comment to resolve" },
    },
    required: ["documentId", "commentId"],
  },
};
