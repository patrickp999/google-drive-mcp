import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function deleteFile(
  args: { fileId: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.fileId);

    await driveClient.files.update({
      fileId: args.fileId,
      fields: "id",
      requestBody: { trashed: true },
    });

    return {
      content: [{ type: "text", text: `File ${args.fileId} moved to Trash.` }],
      isError: false,
    };
  });
}

export const deleteFileToolDefinition = {
  name: "delete_file",
  description: "Move a file to trash in Google Drive (soft delete)",
  inputSchema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "The ID of the file to move to trash" },
    },
    required: ["fileId"],
  },
};
