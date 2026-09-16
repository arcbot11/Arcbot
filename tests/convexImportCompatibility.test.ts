import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';

it('does not use runtime dynamic imports in Convex isolate modules',()=>{
 const failures:string[]=[];
 const scan=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory()){if(entry.name!=='_generated')scan(path);continue;}
  if(!path.endsWith('.ts'))continue;
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  if(source.statements.some(node=>ts.isExpressionStatement(node)&&ts.isStringLiteral(node.expression)&&node.expression.text==='use node'))continue;
  const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)failures.push(path+':'+(source.getLineAndCharacterOfPosition(node.pos).line+1));ts.forEachChild(node,visit);};
  visit(source);
 }};
 scan('convex');expect(failures).toEqual([]);
});
