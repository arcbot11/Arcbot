import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';

it('does not use runtime dynamic imports in Convex isolate modules',()=>{
 const failures:string[]=[];
 const seen=new Set<string>();
 const scanFile=(file:string)=>{
  const path=resolve(file);if(seen.has(path))return;seen.add(path);
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  if(source.statements.some(node=>ts.isExpressionStatement(node)&&ts.isStringLiteral(node.expression)&&node.expression.text==='use node'))return;
  const visit=(node:ts.Node)=>{
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)failures.push(path+':'+(source.getLineAndCharacterOfPosition(node.pos).line+1));
   if((ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly||ts.isExportDeclaration(node)&&!node.isTypeOnly)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.startsWith('.')){
    const base=resolve(dirname(path),node.moduleSpecifier.text.replace(/\.(?:js|ts|tsx)$/, ''));
    const dependency=[base+'.ts',base+'.tsx',join(base,'index.ts')].find(existsSync);
    if(dependency&&!dependency.includes('_generated'))scanFile(dependency);
   }
   ts.forEachChild(node,visit);
  };visit(source);
 };
 const scan=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory()){if(entry.name!=='_generated')scan(path);continue;}
  if(!path.endsWith('.ts'))continue;
  scanFile(path);
 }};
 scan('convex');expect(failures).toEqual([]);
});
