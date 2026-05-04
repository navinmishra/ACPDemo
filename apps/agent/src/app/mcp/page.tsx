import { ChatUI } from "@/components/ChatUI";

export default function McpPage() {
  return (
    <ChatUI
      apiPath="/api/chat/mcp"
      mode="MCP"
      accent="#818cf8"
      accentDim="#1e1b4b"
    />
  );
}
