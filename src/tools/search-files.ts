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
    const userQuery = args.query.trim();
    // Always start with trashed = false, then optionally append the user's search terms.
    const baseParts: string[] = ["trashed = false"];
    if (userQuery) {
      baseParts.push(`(${userQuery})`);
    }

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
      query = [...baseParts, `'${folderId}' in parents`].join(" and ");
    } else if (config.allowedFolderIds.size > 0) {
      // NOTE: Drive API has query length limits (~1000 chars). Folder IDs are ~33 chars each,
      // so queries spanning >~20 folders may be rejected. Fine for personal use but flag for future.
      const folderClauses = [...config.allowedFolderIds]
        .map((id) => `'${id}' in parents`)
        .join(" or ");
      query = [...baseParts, `(${folderClauses})`].join(" and ");
    } else {
      query = baseParts.join(" and ");
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
  description:
    "Search for files within allowed Google Drive folders. Use Drive API query syntax for the query field (e.g. \"name contains 'report'\" or \"mimeType = 'application/pdf'\"). Pass an empty string to list all files.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Drive API query string. Uses Google Drive query syntax — NOT glob patterns or SQL. " +
          "Examples: \"name contains 'report'\" | \"mimeType = 'application/pdf'\" | \"modifiedTime > '2024-01-01'\" | \"fullText contains 'budget'\". " +
          "Pass an empty string to list all files with no filter. " +
          "Operators: contains, =, !=, <, <=, >, >=, in, and, or, not. " +
          "Do NOT use wildcards like '*' or '%' — they are invalid and will cause a 400 error.",
      },
      folderId: {
        type: "string",
        description:
          "Optional: restrict search to this folder ID (must be in ALLOWED_FOLDER_IDS)",
      },
    },
    required: ["query"],
  },
};
