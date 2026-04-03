import { drive_v3 } from "googleapis";
import { docs_v1 } from "googleapis";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function createDocument(
  args: { name: string; folderId: string; content?: string },
  driveClient: drive_v3.Drive,
  docsClient: docs_v1.Docs,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    if (!await accessController.isFolderAllowed(args.folderId)) {
      throw new Error(
        `Access denied: ${args.folderId} is not in the allowed folders or document list.`
      );
    }

    const res = await driveClient.files.create({
      fields: "id,name",
      requestBody: {
        name: args.name,
        mimeType: "application/vnd.google-apps.document",
        parents: [args.folderId],
      },
    });

    const newDocId = res.data.id!;

    if (args.content && args.content.length > 0) {
      await docsClient.documents.batchUpdate({
        documentId: newDocId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: args.content,
              },
            },
          ],
        },
      });
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ id: res.data.id, name: res.data.name }) }],
      isError: false,
    };
  });
}

export const createDocumentToolDefinition = {
  name: "create_document",
  description: "Create a new Google Doc in a specified folder",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The name of the new document" },
      folderId: { type: "string", description: "The ID of the folder to create the document in" },
      content: { type: "string", description: "Optional initial text content for the document" },
    },
    required: ["name", "folderId"],
  },
};
