import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function copyFile(
  args: { fileId: string; destinationFolderId: string; newName: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.fileId);

    if (!await accessController.isFolderAllowed(args.destinationFolderId)) {
      throw new Error(
        `Access denied: ${args.destinationFolderId} is not in the allowed folders or document list.`
      );
    }

    const res = await driveClient.files.copy({
      fileId: args.fileId,
      fields: "id,name",
      requestBody: {
        name: args.newName,
        parents: [args.destinationFolderId],
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ id: res.data.id, name: res.data.name }) }],
      isError: false,
    };
  });
}

export const copyFileToolDefinition = {
  name: "copy_file",
  description: "Copy a Google Drive file into a specified folder with a new name",
  inputSchema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "The ID of the file to copy" },
      destinationFolderId: { type: "string", description: "The ID of the destination folder" },
      newName: { type: "string", description: "The name for the copied file" },
    },
    required: ["fileId", "destinationFolderId", "newName"],
  },
};
