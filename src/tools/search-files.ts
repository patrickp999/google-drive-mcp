import { drive_v3 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { Config } from "../utils/config.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function searchFiles(
  args: { query: string; folderId?: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController,
  config: Config
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    const userQuery = args.query;
    let query: string;

    if (args.folderId) {
      const folderId = args.folderId;
      if (!accessController.isFolderAllowed(folderId)) {
        return {
          content: [
            {
              type: "text",
              text: `Access denied: ${folderId} is not in the allowed folders or document list.`,
            },
          ],
          isError: true,
        };
      }
      query = `(${userQuery}) and '${folderId}' in parents and trashed = false`;
    } else if (config.allowedFolderIds.size > 0) {
      // NOTE: Drive API has query length limits (~1000 chars). Folder IDs are ~33 chars each,
      // so queries spanning >~20 folders may be rejected. Fine for personal use but flag for future.
      const folderClauses = [...config.allowedFolderIds]
        .map((id) => `'${id}' in parents`)
        .join(" or ");
      query = `(${userQuery}) and (${folderClauses}) and trashed = false`;
    } else {
      query = `(${userQuery}) and trashed = false`;
    }

    const res = await driveClient.files.list({
      q: query,
      pageSize: 20,
      fields: "files(id, name, mimeType, modifiedTime)",
    });

    const files = res.data.files ?? [];

    if (files.length === 0) {
      return {
        content: [{ type: "text", text: "No files found." }],
        isError: false,
      };
    }

    const results = files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      isError: false,
    };
  });
}

export const searchFilesToolDefinition = {
  name: "search_files",
  description: "Search for files within allowed Google Drive folders",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      folderId: {
        type: "string",
        description:
          "Optional: restrict search to this folder ID (must be in ALLOWED_FOLDER_IDS)",
      },
    },
    required: ["query"],
  },
};
