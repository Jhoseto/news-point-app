import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps browser Studio mutations on methods supported by the production ingress", () => {
 const root=resolve("apps/studio"), prohibited: string[]=[];
 const files=[...readdirSync(resolve(root,"components"),{recursive:true}).map(p=>`components/${p}`),"lib/resumable-upload.ts","lib/client-api.ts"]
  .filter(p=>/\.tsx?$/.test(p)&&!p.endsWith(".test.ts"));
 for(const file of files){
  const source=ts.createSourceFile(file,readFileSync(resolve(root,file),"utf8"),ts.ScriptTarget.Latest,true,file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const visit=(node:ts.Node)=>{
   if(ts.isPropertyAssignment(node)&&node.name.getText(source).replace(/["']/g,"")==="method"&&ts.isStringLiteral(node.initializer)&&["PUT","PATCH","DELETE"].includes(node.initializer.text))prohibited.push(`${file}: ${node.initializer.text}`);
   if(ts.isCallExpression(node)&&node.expression.getText(source)==="callApi"&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&["PUT","PATCH","DELETE"].includes(node.arguments[0].text))prohibited.push(`${file}: callApi ${node.arguments[0].text}`);
   ts.forEachChild(node,visit);
  };visit(source);
 }
 expect(prohibited).toEqual([]);
});
