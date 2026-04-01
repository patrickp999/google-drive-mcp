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

const server = new Server(
  { name: "google-drive-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    searchFilesToolDefinition,
    readDocumentToolDefinition,
    replaceTextToolDefinition,
    addCommentToolDefinition,
    suggestEditToolDefinition,
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
        docsClient,
        driveClient,
        accessController,
      );
    case "suggest_edit":
      return suggestEdit(
        args as { documentId: string; originalText: string; suggestedText: string },
        docsClient,
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
