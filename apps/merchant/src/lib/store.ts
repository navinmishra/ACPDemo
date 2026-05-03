import type{CheckoutSession}from"@acp-demo/types";
declare global{var __sessions:Map<string,CheckoutSession>|undefined}
const sessions=global.__sessions??(global.__sessions=new Map<string,CheckoutSession>());
export const store={get:(id:string)=>sessions.get(id)??null,set:(id:string,s:CheckoutSession)=>{sessions.set(id,s);return s;},del:(id:string)=>sessions.delete(id),getAll:()=>Array.from(sessions.values())};