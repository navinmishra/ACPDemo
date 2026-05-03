"use client";
import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">
      <header className="px-5 py-3 border-b border-gray-800 bg-gray-900 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-lg">⚡</div>
        <div><h1 className="font-bold text-indigo-400 text-sm">ACP Shopping Agent</h1><p className="text-xs text-gray-500">Powered by Claude · OpenAI ACP 2026-04-17</p></div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (<div className="text-center text-gray-600 mt-16"><p className="text-4xl mb-3">🛍</p><p className="font-semibold text-gray-400 mb-2">What would you like to buy?</p></div>)}
        {messages.map(m => (
          <div key={m.id} className={"flex "+(m.role==="user"?"justify-end":"justify-start")}>
            {m.role!=="user" && <div className="w-6 h-6 rounded-md bg-indigo-900 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">🤖</div>}
            <div className={"max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed "+(m.role==="user"?"bg-indigo-600 text-white rounded-br-sm":"bg-gray-800 text-gray-100 rounded-bl-sm")}>
              {m.parts?.map((p:any,i:number) => { if(p.type==="text") return <span key={i} className="whitespace-pre-wrap">{p.text}</span>; if(p.type==="tool-invocation") return <span key={i} className="block text-xs text-yellow-500/80 mt-1">⚡ ACP: {p.toolInvocation.toolName}</span>; return null; }) ?? <span className="whitespace-pre-wrap">{m.content}</span>}
            </div>
          </div>
        ))}
        {isLoading && (<div className="flex items-center gap-2 text-gray-500"><div className="w-6 h-6 rounded-md bg-indigo-900 flex items-center justify-center text-xs">🤖</div><div className="flex gap-1">{[0,1,2].map(i=><span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:i*150+"ms"}}/>)}</div></div>)}
        <div ref={endRef}/>
      </div>
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-800 bg-gray-900 flex gap-2">
        <input value={input} onChange={handleInputChange} disabled={isLoading} placeholder="Ask the agent to help you shop…" className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-gray-100 placeholder-gray-500"/>
        {isLoading ? <button type="button" onClick={stop} className="bg-red-700 rounded-full px-4 py-2 text-sm font-semibold text-white">Stop</button> : <button type="submit" disabled={!input.trim()} className="bg-indigo-600 disabled:opacity-40 rounded-full px-4 py-2 text-sm font-semibold text-white">Send</button>}
      </form>
    </div>
  );
}