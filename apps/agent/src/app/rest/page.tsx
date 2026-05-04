import { ChatUI } from "@/components/ChatUI";

export default function RestPage() {
  return (
    <ChatUI
      apiPath="/api/chat"
      mode="REST"
      accent="#10b981"
      accentDim="#064e3b"
    />
  );
}
