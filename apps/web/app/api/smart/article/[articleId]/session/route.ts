import { NextRequest } from "next/server";
import { smartApi } from "@/lib/smart-api";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{articleId:string}>}){return smartApi(request,"session",(await params).articleId);}
export const POST=GET;
