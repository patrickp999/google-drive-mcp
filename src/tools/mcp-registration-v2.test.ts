/**
 * Feature: google-drive-mcp-v2
 * MCP registration tests — verifies all 16 tools are registered with valid schemas
 * Validates: Requirements 12.1, 12.2
 */

import { describe, it, expect } from "vitest";

import { listCommentsToolDefinition } from "./list-comments.js";
import { getCommentToolDefinition } from "./get-comment.js";
import { replyToCommentToolDefinition } from "./reply-to-comment.js";
import { resolveCommentToolDefinition } from "./resolve-comment.js";
import { deleteCommentToolDefinition } from "./delete-comment.js";
import { createFolderToolDefinition } from "./create-folder.js";
import { copyFileToolDefinition } from "./copy-file.js";
import { renameFileToolDefinition } from "./rename-file.js";
import { deleteFileToolDefinition } from "./delete-file.js";
import { createDocumentToolDefinition } from "./create-document.js";
import { exportAsPdfToolDefinition } from "./export-as-pdf.js";
import { searchFilesToolDefinition } from "./search-files.js";
import { readDocumentToolDefinition } from "./read-document.js";
import { replaceTextToolDefinition } from "./replace-text.js";
import { addCommentToolDefinition } from "./add-comment.js";
import { suggestEditToolDefinition } from "./suggest-edit.js";

const allDefinitions = [
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
];

describe("MCP Registration v2 — all 16 tools registered", () => {
  it("has exactly 16 tool definitions", () => {
    expect(allDefinitions).toHaveLength(16);
  });

  it("each tool has a unique name", () => {
    const names = allDefinitions.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(allDefinitions.map((d) => [d.name, d]))(
    "%s has a valid JSON Schema inputSchema with required fields",
    (_name, def) => {
      expect(def.inputSchema).toBeDefined();
      expect(def.inputSchema.type).toBe("object");
      expect(def.inputSchema.properties).toBeDefined();
      expect(Array.isArray(def.inputSchema.required)).toBe(true);
      expect(def.inputSchema.required.length).toBeGreaterThan(0);
      for (const reqField of def.inputSchema.required) {
        expect(def.inputSchema.properties).toHaveProperty(reqField);
      }
    },
  );

  it("all v2 tool names are present", () => {
    const names = allDefinitions.map((d) => d.name);
    const v2Names = [
      "list_comments", "get_comment", "reply_to_comment", "resolve_comment", "delete_comment",
      "create_folder", "copy_file", "rename_file", "delete_file",
      "create_document", "export_as_pdf",
    ];
    for (const n of v2Names) {
      expect(names).toContain(n);
    }
  });

  it("all v1 tool names are still present", () => {
    const names = allDefinitions.map((d) => d.name);
    const v1Names = ["search_files", "read_document", "replace_text", "add_comment", "suggest_edit"];
    for (const n of v1Names) {
      expect(names).toContain(n);
    }
  });
});
