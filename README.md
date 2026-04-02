# Google Drive MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants scoped access to your Google Drive and Docs.

## Key Features

- Search files across your Drive using Google Drive query syntax
- Read Google Docs as plain text
- Replace text, add comments, and suggest edits in Docs
- **Access control via folder and document allowlists** — restrict the AI to only the files and folders you explicitly permit

## Access Control

This server supports two environment variables to limit what the AI can access:

- `ALLOWED_FOLDER_IDS` — comma-separated list of Google Drive folder IDs. The AI can only search and access files within these folders.
- `ALLOWED_DOC_IDS` — comma-separated list of specific Google Doc IDs the AI is allowed to read and edit.

If both are left empty, the server operates in **no-restriction mode** and can access your entire Drive (a warning is logged at startup).

### Finding a Folder or File ID

The ID is the last segment of the URL when you open a folder or file in Google Drive:

```
https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is the folder ID
```

## Tools

| Tool | Description |
|------|-------------|
| `search_files` | Search for files using Drive API query syntax. Optionally restrict to a specific folder ID. |
| `read_document` | Read the full text content of a Google Doc. |
| `replace_text` | Find and replace text within a Google Doc. |
| `add_comment` | Add a comment anchored to specific text in a Google Doc. |
| `suggest_edit` | Propose a text change as a suggestion in a Google Doc. |

### Search Query Syntax

The `search_files` tool uses [Google Drive query syntax](https://developers.google.com/drive/api/guides/search-files), not glob patterns. Examples:

```
name contains 'report'
mimeType = 'application/pdf'
fullText contains 'budget'
modifiedTime > '2024-01-01'
```

Pass an empty string to list all accessible files.

## Setup

### 1. Create Google Cloud credentials

1. [Create a new Google Cloud project](https://console.cloud.google.com/projectcreate)
2. Enable the [Google Drive API](https://console.cloud.google.com/workspace-api/products) and [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
3. Configure an [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) — set to "External", add yourself as a test user
4. Create an [OAuth Client ID](https://console.cloud.google.com/apis/credentials/oauthclient) with application type **Desktop app**
5. Note your `Client ID` and `Client Secret`

### 2. Configure environment variables

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Optional: restrict access to specific folders and docs
ALLOWED_FOLDER_IDS=folderId1,folderId2
ALLOWED_DOC_IDS=docId1,docId2
```

### 3. Build

```bash
npm install
npm run build
```

### 4. First run — OAuth authorization

On first connection, the server will open your browser to complete Google OAuth authorization. After approving, the token is saved to `~/.gdrive-mcp-token.json` and reused on subsequent connections.

## Kiro / MCP Configuration

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "google-drive-mcp": {
      "command": "node",
      "args": ["/path/to/google-drive-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "ALLOWED_FOLDER_IDS": "folderId1,folderId2",
        "ALLOWED_DOC_IDS": "docId1"
      }
    }
  }
}
```

## License

MIT
