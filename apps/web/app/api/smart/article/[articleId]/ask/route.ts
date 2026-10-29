import { NextRequest } from "next/server";
import { smartApi } from "@/lib/smart-api";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{articleId:string}>}){return smartApi(request,"ask",(await params).articleId);}
