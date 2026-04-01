import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function withErrorHandling(
  handler: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await handler();
  } catch (err: unknown) {
    const message = formatError(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const e = err as any;

    // Detect network timeouts: ETIMEDOUT/ECONNRESET error codes or message containing "timeout"
    const code: string | undefined = e.code;
    if (
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      e.message?.toLowerCase().includes("timeout")
    ) {
      return "Request timed out calling Google API";
    }

    // Detect Google API HTTP errors via GaxiosError (response.status) or plain code/status fields
    const status: number | undefined =
      e?.response?.status ?? e?.status ?? e?.code;
    if (typeof status === "number" && status >= 100) {
      const message =
        e?.response?.data?.error?.message ?? e?.message ?? String(err);
      return `Google API error (${status}): ${message}`;
    }

    return err.message;
  }
  return String(err);
}
