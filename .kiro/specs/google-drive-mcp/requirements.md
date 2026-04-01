# Requirements Document

## Introduction

google-drive-mcp is a Model Context Protocol (MCP) server built by extending the official Anthropic Google Drive MCP server. It adds Google Docs editing capabilities — including reading, commenting, and suggesting edits — so that AI assistants like Kiro and Claude Desktop can interact with documents in a user's Google Drive. The primary use case is AI-assisted resume editing and document collaboration. Access is strictly controlled via environment variable configuration to limit which folders and documents the server may touch.

## Glossary

- **Server**: The google-drive-mcp MCP server process
- **Client**: An MCP-compatible AI assistant (Kiro or Claude Desktop) that connects to the Server
- **Drive_API**: The Google Drive REST API v3
- **Docs_API**: The Google Docs REST API v1
- **Access_Controller**: The component that validates file/document access against allowed lists
- **OAuth_Handler**: The component that manages Google OAuth 2.0 authentication and token lifecycle
- **Tool**: An MCP-exposed function callable by the Client
- **Allowed_Folder**: A Google Drive folder ID listed in the ALLOWED_FOLDER_IDS environment variable
- **Allowed_Doc**: A Google Docs document ID listed in the ALLOWED_DOC_IDS environment variable
- **Suggestion**: A tracked change in a Google Doc (equivalent to "Suggest edits" mode in Google Docs UI)
- **Comment**: An annotation attached to a specific range of text in a Google Doc

---

## Requirements

### Requirement 1: OAuth Authentication

**User Story:** As a developer, I want the Server to authenticate with Google using OAuth 2.0, so that it can access Drive and Docs APIs on behalf of the user.

#### Acceptance Criteria

1. THE OAuth_Handler SHALL request authorization using the scopes `https://www.googleapis.com/auth/drive` and `https://www.googleapis.com/auth/documents`. The broader `drive` scope (rather than `drive.file`) is required because `drive.file` only grants access to files created by the app itself, which would prevent the server from accessing pre-existing documents such as the user's resume. Application-level access restriction is enforced by the Access_Controller via `ALLOWED_FOLDER_IDS` and `ALLOWED_DOC_IDS`.
2. THE OAuth_Handler SHALL read `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from environment variables at startup.
3. IF `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing at startup, THEN THE Server SHALL exit with a descriptive error message identifying which variable is absent.
4. THE OAuth_Handler SHALL persist the OAuth token to disk so that subsequent Server starts do not require re-authorization.
5. WHEN the OAuth token expires, THE OAuth_Handler SHALL refresh the token automatically without requiring user interaction.
6. IF the OAuth token refresh fails, THEN THE OAuth_Handler SHALL prompt the user to re-authorize and provide the authorization URL.

---

### Requirement 2: Config-Driven Access Control

**User Story:** As a developer, I want every tool to validate access against an allowlist of folder and document IDs, so that the Server cannot read or modify files outside the permitted scope.

#### Acceptance Criteria

1. THE Access_Controller SHALL read `ALLOWED_FOLDER_IDS` from environment variables as a comma-separated list of Google Drive folder IDs.
2. THE Access_Controller SHALL read `ALLOWED_DOC_IDS` from environment variables as a comma-separated list of Google Docs document IDs.
3. WHEN a Tool is invoked with a file or document ID, THE Access_Controller SHALL verify that the ID is either in the `ALLOWED_DOC_IDS` list or is a child of a folder in the `ALLOWED_FOLDER_IDS` list before executing any API call.
4. IF a requested file or document ID fails the access check, THEN THE Access_Controller SHALL return an error message in the format: `"Access denied: <id> is not in the allowed folders or document list."` without executing the requested operation.
5. IF both `ALLOWED_FOLDER_IDS` and `ALLOWED_DOC_IDS` are empty at startup, THEN THE Server SHALL log a warning indicating that no access restrictions are configured.
6. THE Access_Controller SHALL treat leading and trailing whitespace in comma-separated ID values as insignificant when parsing environment variables.
7. WHEN `ALLOWED_FOLDER_IDS` is configured, THE Access_Controller SHALL grant access to all files and documents contained within those folders without requiring their individual IDs to be listed in `ALLOWED_DOC_IDS`.
8. `ALLOWED_DOC_IDS` SHALL serve as an escape hatch to grant access to specific documents that reside outside of any configured `ALLOWED_FOLDER_IDS`.
9. THE Access_Controller SHALL evaluate access in the following order: first check if the document ID is in `ALLOWED_DOC_IDS`, then check if the document's parent folder is in `ALLOWED_FOLDER_IDS`. IF either check passes, THEN access SHALL be granted. IF neither check passes, THEN access SHALL be denied.

---

### Requirement 3: search_files Tool

**User Story:** As an AI assistant, I want to search for files within allowed folders, so that I can locate documents relevant to a user's request.

#### Acceptance Criteria

1. THE Server SHALL expose a Tool named `search_files` that accepts a `query` string parameter and an optional `folderId` string parameter.
2. WHEN `search_files` is invoked, THE Server SHALL restrict the Drive_API search to files contained within the Allowed_Folders only.
3. WHEN a `folderId` parameter is provided, THE Access_Controller SHALL verify that `folderId` is in the `ALLOWED_FOLDER_IDS` list before executing the search.
4. IF `folderId` is provided but is not an Allowed_Folder, THEN THE Server SHALL return an access denied error without executing the search.
5. WHEN `search_files` returns results, THE Server SHALL include the file ID, file name, MIME type, and last modified timestamp for each result.
6. IF the Drive_API returns no results, THEN THE Server SHALL return an empty list with a message indicating no files were found.

---

### Requirement 4: read_document Tool

**User Story:** As an AI assistant, I want to read the full text content of a Google Doc, so that I can understand and analyze the document.

#### Acceptance Criteria

1. THE Server SHALL expose a Tool named `read_document` that accepts a `documentId` string parameter.
2. WHEN `read_document` is invoked, THE Access_Controller SHALL validate the `documentId` before any Docs_API call is made.
3. IF the `documentId` fails the access check, THEN THE Server SHALL return an access denied error.
4. WHEN `read_document` is invoked with a valid `documentId`, THE Server SHALL return the full plain-text content of the document extracted from the Docs_API response.
5. WHEN `read_document` is invoked, THE Server SHALL also return the document title.
6. IF the Docs_API returns an error for a valid `documentId`, THEN THE Server SHALL return a descriptive error message that includes the API error detail.

---

### Requirement 5: replace_text Tool

**User Story:** As an AI assistant, I want to find and replace text within a Google Doc, so that I can make direct edits to a document's content.

#### Acceptance Criteria

1. THE Server SHALL expose a Tool named `replace_text` that accepts `documentId`, `findText`, and `replaceText` string parameters.
2. WHEN `replace_text` is invoked, THE Access_Controller SHALL validate the `documentId` before any Docs_API call is made.
3. IF the `documentId` fails the access check, THEN THE Server SHALL return an access denied error.
4. WHEN `replace_text` is invoked with a valid `documentId`, THE Server SHALL use the Docs_API `batchUpdate` endpoint with a `replaceAllText` request to replace all occurrences of `findText` with `replaceText`.
5. WHEN `replace_text` completes successfully, THE Server SHALL return the number of replacements made.
6. IF `findText` is not found in the document, THEN THE Server SHALL return a result indicating zero replacements were made.
7. IF the Docs_API returns an error, THEN THE Server SHALL return a descriptive error message that includes the API error detail.

---

### Requirement 6: add_comment Tool

**User Story:** As an AI assistant, I want to add a comment to a specific section of a Google Doc, so that I can annotate the document with feedback without altering the content.

#### Acceptance Criteria

1. THE Server SHALL expose a Tool named `add_comment` that accepts `documentId`, `content` (the comment text), and `anchorText` (the text in the document to anchor the comment to) string parameters.
2. WHEN `add_comment` is invoked, THE Access_Controller SHALL validate the `documentId` before any API call is made.
3. IF the `documentId` fails the access check, THEN THE Server SHALL return an access denied error.
4. WHEN `add_comment` is invoked with a valid `documentId`, THE Server SHALL use the Drive_API Comments endpoint to create a comment anchored to the range containing `anchorText`.
5. WHEN `add_comment` completes successfully, THE Server SHALL return the comment ID of the newly created comment.
6. IF `anchorText` is not found in the document, THEN THE Server SHALL return an error message indicating the anchor text could not be located.
7. IF the Drive_API returns an error, THEN THE Server SHALL return a descriptive error message that includes the API error detail.
8. IF `anchorText` appears multiple times in the document, THE Server SHALL anchor the comment to the first occurrence.

#### Implementation Notes

- Anchoring a comment to `anchorText` requires two internal steps: (1) call the Docs_API to retrieve the full document content and locate the `anchorText` string within it, then (2) calculate the start and end character offsets of the located text before passing them to the Drive_API Comments endpoint.
- Raw character offsets SHALL NOT be exposed as tool input parameters. `anchorText` as a plain string is the correct user-facing interface; offset calculation is an internal implementation detail handled automatically by the tool.

---

### Requirement 7: suggest_edit Tool

**User Story:** As an AI assistant, I want to propose a text change in a Google Doc so that the document owner can review and apply it manually.

> **API Limitation Note:** The Google Docs API v1 does not support programmatically creating tracked changes or suggestions. The API can only read existing suggestions — it cannot create, accept, or reject them. See: https://developers.google.com/workspace/docs/api/how-tos/suggestions. Therefore, `suggest_edit` simulates suggestion behaviour by posting a structured comment anchored to the original text, leaving the document content unmodified.

#### Acceptance Criteria

1. THE Server SHALL expose a Tool named `suggest_edit` that accepts `documentId`, `originalText`, and `suggestedText` string parameters.
2. WHEN `suggest_edit` is invoked, THE Access_Controller SHALL validate the `documentId` before any API call is made.
3. IF the `documentId` fails the access check, THEN THE Server SHALL return an access denied error.
4. WHEN `suggest_edit` is invoked with a valid `documentId`, THE Server SHALL locate `originalText` within the document and post a Drive_API comment anchored to that text with the body: `"Suggested edit: replace with '<suggestedText>'"`.
5. THE Server SHALL leave the original document content unmodified so the document owner can review and apply the change manually.
6. WHEN `suggest_edit` completes successfully, THE Server SHALL return the comment ID of the newly created comment.
7. IF `originalText` is not found in the document, THEN THE Server SHALL return an error message indicating the original text could not be located.
8. IF `originalText` appears multiple times in the document, THE Server SHALL anchor the comment to the first occurrence.
9. IF the Drive_API returns an error, THEN THE Server SHALL return a descriptive error message that includes the API error detail.

#### Implementation Notes

- The implementation follows the same two-step anchor pattern as `add_comment`: call the Docs_API to retrieve document content, locate `originalText` to determine character offsets, then pass those offsets to the Drive_API Comments endpoint.
- Native tracked-change creation is not possible via the Google Docs API v1. This comment-based approach is the correct and only viable programmatic simulation.

---

### Requirement 8: MCP Protocol Compliance

**User Story:** As a developer, I want the Server to be fully compliant with the MCP SDK, so that it works without modification in both Kiro and Claude Desktop.

#### Acceptance Criteria

1. THE Server SHALL implement the MCP protocol using the official `@modelcontextprotocol/sdk` package.
2. THE Server SHALL expose all Tools with JSON Schema definitions for their input parameters so that Clients can discover and validate tool inputs.
3. THE Server SHALL communicate over stdio transport so that it is compatible with both Kiro and Claude Desktop MCP configurations.
4. THE Server SHALL compile to `dist/index.js` via the TypeScript compiler so that MCP config files can reference a single entry point.
5. WHEN the Server starts, THE Server SHALL register all five Tools (`search_files`, `read_document`, `replace_text`, `add_comment`, `suggest_edit`) with the MCP SDK.

---

### Requirement 9: Error Handling and Resilience

**User Story:** As a developer, I want the Server to handle API errors gracefully, so that failures are surfaced clearly to the Client without crashing the Server process.

#### Acceptance Criteria

1. WHEN any Google API call returns an HTTP error response, THE Server SHALL catch the error and return a structured error message to the Client rather than throwing an unhandled exception.
2. WHEN a network timeout occurs during a Google API call, THE Server SHALL return an error message indicating the request timed out.
3. THE Server SHALL remain running after returning an error response so that subsequent Tool invocations can succeed.
4. IF an unrecognized Tool name is invoked, THEN THE Server SHALL return an MCP-compliant error response indicating the Tool is not found.
