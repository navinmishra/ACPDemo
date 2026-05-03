import type{Metadata}from"next";
export const metadata:Metadata={title:"ACP Shopping Agent",description:"AI shopping powered by Agentic Commerce Protocol"};
export default function RootLayout({children}:{children:React.ReactNode}){return(<html lang="en"><body style={{margin:0,fontFamily:"system-ui,sans-serif",background:"#030712",color:"#f9fafb"}}>{children}</body></html>);}