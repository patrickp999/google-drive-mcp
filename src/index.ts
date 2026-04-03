#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { getAuthClient } from "./auth.js";
import { AccessController } from "./access-controller.js";
import { loadConfig } from "./utils/config.js";
import { searchFiles, searchFilesToolDefinition } from "./tools/search-files.js";
import { readDocument, readDocumentToolDefinition } from "./tools/read-document.js";
import { replaceText, replaceTextToolDefinition } from "./tools/replace-text.js";
import { addComment, addCommentToolDefinition } from "./tools/add-comment.js";
import { suggestEdit, suggestEditToolDefinition } from "./tools/suggest-edit.js";
import { replyToComment, replyToCommentToolDefinition } from "./tools/reply-to-comment.js";
import { listComments, listCommentsToolDefinition } from "./tools/list-comments.js";
import { getComment, getCommentToolDefinition } from "./tools/get-comment.js";
import { resolveComment, resolveCommentToolDefinition } from "./tools/resolve-comment.js";
import { deleteComment, deleteCommentToolDefinition } from "./tools/delete-comment.js";
import { createFolder, createFolderToolDefinition } from "./tools/create-folder.js";
import { copyFile, copyFileToolDefinition } from "./tools/copy-file.js";
import { renameFile, renameFileToolDefinition } from "./tools/rename-file.js";
import { deleteFile, deleteFileToolDefinition } from "./tools/delete-file.js";
import { createDocument, createDocumentToolDefinition } from "./tools/create-document.js";
import { exportAsPdf, exportAsPdfToolDefinition } from "./tools/export-as-pdf.js";

const server = new Server(
  { name: "google-drive-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    searchFilesToolDefinition,
    readDocumentToolDefinition,
    replaceTextToolDefinition,
    addCommentToolDefinition,
    suggestEditToolDefinition,
    replyToCommentToolDefinition,
    listCommentsToolDefinition,
    getCommentToolDefinition,
    resolveCommentToolDefinition,
    deleteCommentToolDefinition,
    createFolderToolDefinition,
    copyFileToolDefinition,
    renameFileToolDefinition,
    deleteFileToolDefinition,
    createDocumentToolDefinition,
    exportAsPdfToolDefinition,
  ],
}));

// These are set in main() before the server starts accepting requests
let driveClient: ReturnType<typeof google.drive>;
let docsClient: ReturnType<typeof google.docs>;
let accessController: AccessController;

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case "search_files":
      return searchFiles(
        args as { query: string; folderId?: string },
        driveClient,
        accessController,
        loadedConfig!,
      );
    case "read_document":
      return readDocument(
        args as { documentId: string },
        docsClient,
        accessController,
      );
    case "replace_text":
      return replaceText(
        args as { documentId: string; findText: string; replaceText: string },
        docsClient,
        accessController,
      );
    case "add_comment":
      return addComment(
        args as { documentId: string; content: string; anchorText: string },
        driveClient,
        accessController,
      );
    case "suggest_edit":
      return suggestEdit(
        args as { documentId: string; originalText: string; suggestedText: string },
        driveClient,
        accessController,
      );
    case "reply_to_comment":
      return replyToComment(
        args as { documentId: string; commentId: string; content: string },
        driveClient,
        accessController,
      );
    case "list_comments":
      return listComments(
        args as { documentId: string },
        driveClient,
        accessController,
      );
    case "get_comment":
      return getComment(
        args as { documentId: string; commentId: string },
        driveClient,
        accessController,
      );
    case "resolve_comment":
      return resolveComment(
        args as { documentId: string; commentId: string },
        driveClient,
        accessController,
      );
    case "delete_comment":
      return deleteComment(
        args as { documentId: string; commentId: string },
        driveClient,
        accessController,
      );
    case "create_folder":
      return createFolder(
        args as { name: string; parentFolderId: string },
        driveClient,
        accessController,
      );
    case "copy_file":
      return copyFile(
        args as { fileId: string; destinationFolderId: string; newName: string },
        driveClient,
        accessController,
      );
    case "rename_file":
      return renameFile(
        args as { fileId: string; newName: string },
        driveClient,
        accessController,
      );
    case "delete_file":
      return deleteFile(
        args as { fileId: string },
        driveClient,
        accessController,
      );
    case "create_document":
      return createDocument(
        args as { name: string; folderId: string; content?: string },
        driveClient,
        docsClient,
        accessController,
      );
    case "export_as_pdf":
      return exportAsPdf(
        args as { documentId: string; destinationFolderId: string; filename: string },
        driveClient,
        accessController,
      );
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

let loadedConfig: ReturnType<typeof loadConfig> | null = null;

async function main() {
  const config = loadConfig();
  loadedConfig = config;

  const auth = await getAuthClient(config);
  google.options({ auth });

  driveClient = google.drive("v3");
  docsClient = google.docs("v1");
  accessController = new AccessController(config, driveClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
