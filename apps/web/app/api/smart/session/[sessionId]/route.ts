import { NextRequest } from "next/server";
import { smartApi } from "@/lib/smart-api";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){return smartApi(request,"history",(await params).sessionId);}
export const DELETE=GET;
