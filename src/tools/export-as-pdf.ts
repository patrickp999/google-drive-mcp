import { drive_v3 } from "googleapis";
import { Readable } from "stream";
import { AccessController } from "../access-controller.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function exportAsPdf(
  args: { documentId: string; destinationFolderId: string; filename: string },
  driveClient: drive_v3.Drive,
  accessController: AccessController
): Promise<CallToolResult> {
  return withErrorHandling(async () => {
    await accessController.assertAllowed(args.documentId);

    if (!await accessController.isFolderAllowed(args.destinationFolderId)) {
      throw new Error(
        `Access denied: ${args.destinationFolderId} is not in the allowed folders or document list.`
      );
    }

    let filename = args.filename;
    if (!filename.endsWith(".pdf")) {
      filename = `${filename}.pdf`;
    }

    const exportRes = await driveClient.files.export(
      { fileId: args.documentId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(exportRes.data as ArrayBuffer);
    const stream = Readable.from(buffer);

    const uploadRes = await driveClient.files.create({
      fields: "id,name",
      requestBody: {
        name: filename,
        mimeType: "application/pdf",
        parents: [args.destinationFolderId],
      },
      media: {
        mimeType: "application/pdf",
        body: stream,
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ id: uploadRes.data.id, name: uploadRes.data.name }) }],
      isError: false,
    };
  });
}

export const exportAsPdfToolDefinition = {
  name: "export_as_pdf",
  description: "Export a Google Doc as a PDF file saved into a specified folder",
  inputSchema: {
    type: "object",
    properties: {
      documentId: { type: "string", description: "The Google Doc document ID to export" },
      destinationFolderId: { type: "string", description: "The ID of the folder to save the PDF in" },
      filename: { type: "string", description: "The filename for the exported PDF" },
    },
    required: ["documentId", "destinationFolderId", "filename"],
  },
};
