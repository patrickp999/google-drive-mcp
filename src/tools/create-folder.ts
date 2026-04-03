import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function createFolder(
  args: { name: string; parentFolderId: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    if (!args.parentFolderId) {
      throw new Error("A parentFolderId is required and must be an Allowed_Folder.");
    }

    if (!await accessController.isFolderAllowed(args.parentFolderId)) {
      throw new Error(
        `Access denied: ${args.parentFolderId} is not in the allowed folders or document list.`
      );
    }

    const res = await driveClient.files.create({
      fields: "id,name",
      requestBody: {
        name: args.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [args.parentFolderId],
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ id: res.data.id, name: res.data.name }) }],
      isError: false,
    };
  });
}

export const createFolderToolDefinition = {
  name: "create_folder",
  description: "Create a new folder in Google Drive",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The name of the new folder" },
      parentFolderId: { type: "string", description: "The ID of the parent folder (must be in ALLOWED_FOLDER_IDS)" },
    },
    required: ["name", "parentFolderId"],
  },
};
