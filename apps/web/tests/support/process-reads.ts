import fs from "node:fs";
import ts from "typescript";

/**
 * Every read of the `process` global in a source file that is not exactly
 * `process.env.NODE_ENV`, found in the TypeScript syntax tree (Pitch 21b), so
 * the word "process" in a string or comment never counts and a comment-like
 * sequence inside a string can never hide a real read. Mirrors rule B3e in
 * scripts/workspace-boundaries.mjs.
 */
export function nonNodeEnvProcessReads(file: string): number[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === "process") {
      const p = node.parent;
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        (ts.isQualifiedName(p) && p.right === node) ||
        ((ts.isPropertyAssignment(p) ||
          ts.isPropertySignature(p) ||
          ts.isPropertyDeclaration(p) ||
          ts.isMethodDeclaration(p) ||
          ts.isMethodSignature(p) ||
          ts.isEnumMember(p)) &&
          p.name === node);
      const nodeEnv =
        ts.isPropertyAccessExpression(p) &&
        p.expression === node &&
        p.name.text === "env" &&
        ts.isPropertyAccessExpression(p.parent) &&
        p.parent.expression === p &&
        p.parent.name.text === "NODE_ENV";
      const declaration =
        ts.isVariableDeclaration(p) && file.endsWith("env.d.ts");
      if (!isName && !nodeEnv && !declaration) {
        lines.push(
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}
