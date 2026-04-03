import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function renameFile(
  args: { fileId: string; newName: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.fileId);

    const res = await driveClient.files.update({
      fileId: args.fileId,
      fields: "id,name",
      requestBody: { name: args.newName },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ id: res.data.id, name: res.data.name }) }],
      isError: false,
    };
  });
}

export const renameFileToolDefinition = {
  name: "rename_file",
  description: "Rename a file or folder in Google Drive",
  inputSchema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "The ID of the file or folder to rename" },
      newName: { type: "string", description: "The new name for the file or folder" },
    },
    required: ["fileId", "newName"],
  },
};
