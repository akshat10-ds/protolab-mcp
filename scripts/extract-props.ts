/**
 * Prop extraction — parses TypeScript source files to extract structured
 * prop metadata (types, required, defaults, descriptions) using the TS compiler API.
 *
 * Called by bundle-data.ts after reading source files.
 */

import ts from 'typescript';

// ── Output types ─────────────────────────────────────────────────────

export interface PropTypeAlias {
  name: string;
  type: 'union' | 'other';
  values?: string[];    // for union types
  raw?: string;         // for non-union types
}

export interface PropDetail {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  values?: string[];    // expanded union values, if applicable
}

export interface ComponentPropDetails {
  types: PropTypeAlias[];
  props: PropDetail[];
  extends?: string;     // e.g., "React.ButtonHTMLAttributes<HTMLButtonElement>"
}

// ── Extraction entry point ──────────────────────────────────────────

/**
 * Extract prop details for a component from its source files.
 *
 * @param componentName - e.g., "Button"
 * @param sourceFiles - array of { path, content } for the component
 */
export function extractComponentProps(
  componentName: string,
  sourceFiles: Array<{ path: string; content: string }>
): ComponentPropDetails | null {
  // Find the types file or main TSX file
  const typesFile = sourceFiles.find(f => f.path.endsWith('/types.ts') || f.path.endsWith('.types.ts'));
  const tsxFile = sourceFiles.find(f => f.path.endsWith(`${componentName}.tsx`));

  // Parse all source into one combined context for type alias resolution
  const typeAliases = new Map<string, PropTypeAlias>();
  const allFiles = [typesFile, tsxFile].filter(Boolean) as Array<{ path: string; content: string }>;

  for (const file of allFiles) {
    extractTypeAliases(file.content, typeAliases);
  }

  // Find the props interface
  const propsInterfaceName = `${componentName}Props`;
  let propsResult: { props: PropDetail[]; extends?: string } | null = null;

  // Check types file first, then TSX
  for (const file of allFiles) {
    propsResult = extractPropsInterface(file.content, propsInterfaceName, typeAliases);
    if (propsResult && propsResult.props.length > 0) break;
  }

  if (!propsResult || propsResult.props.length === 0) return null;

  // Extract defaults from the TSX component function
  if (tsxFile) {
    const defaults = extractDefaults(tsxFile.content, componentName);
    for (const prop of propsResult.props) {
      if (defaults.has(prop.name)) {
        prop.default = defaults.get(prop.name)!;
      }
    }
  }

  // Expand union values onto props where applicable
  for (const prop of propsResult.props) {
    const alias = typeAliases.get(prop.type);
    if (alias?.type === 'union' && alias.values) {
      prop.values = alias.values;
    }
  }

  return {
    types: Array.from(typeAliases.values()),
    props: propsResult.props,
    ...(propsResult.extends && { extends: propsResult.extends }),
  };
}

// ── Internal: Extract type aliases ──────────────────────────────────

function extractTypeAliases(content: string, out: Map<string, PropTypeAlias>): void {
  const sourceFile = ts.createSourceFile('temp.ts', content, ts.ScriptTarget.Latest, true);

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isTypeAliasDeclaration(node)) return;
    if (!hasExportModifier(node)) return;

    const name = node.name.text;
    const typeNode = node.type;

    if (ts.isUnionTypeNode(typeNode)) {
      const values = typeNode.types
        .map(t => {
          if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
            return t.literal.text;
          }
          return null;
        })
        .filter(Boolean) as string[];

      if (values.length > 0) {
        out.set(name, { name, type: 'union', values });
        return;
      }
    }

    out.set(name, { name, type: 'other', raw: typeNode.getText(sourceFile) });
  });
}

// ── Internal: Extract props interface ───────────────────────────────

function extractPropsInterface(
  content: string,
  interfaceName: string,
  typeAliases: Map<string, PropTypeAlias>
): { props: PropDetail[]; extends?: string } | null {
  const sourceFile = ts.createSourceFile('temp.ts', content, ts.ScriptTarget.Latest, true);
  let found: ts.InterfaceDeclaration | null = null;

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = node;
    }
  });

  if (!found) return null;

  const iface = found as ts.InterfaceDeclaration;
  const props: PropDetail[] = [];

  // Extract extends clause
  let extendsClause: string | undefined;
  if (iface.heritageClauses) {
    for (const clause of iface.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        extendsClause = clause.types.map(t => t.getText(sourceFile)).join(', ');
      }
    }
  }

  // Extract each property
  for (const member of iface.members) {
    if (!ts.isPropertySignature(member)) continue;

    const name = member.name.getText(sourceFile);
    const required = !member.questionToken;
    const typeStr = member.type ? member.type.getText(sourceFile) : 'unknown';
    const description = getJsDocComment(member, sourceFile);

    // Simplify the type string for readability
    const simplifiedType = simplifyType(typeStr, typeAliases);

    props.push({
      name,
      type: simplifiedType,
      required,
      ...(description && { description }),
    });
  }

  return { props, ...(extendsClause && { extends: extendsClause }) };
}

// ── Internal: Extract defaults from component function ──────────────

function extractDefaults(content: string, componentName: string): Map<string, string> {
  const defaults = new Map<string, string>();
  const sourceFile = ts.createSourceFile('temp.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  ts.forEachChild(sourceFile, (node) => {
    // Match: const Button = ({ kind = 'primary', ... }: ButtonProps) => { ... }
    // Or:    export const Button = forwardRef<..., ButtonProps>(({ kind = 'primary', ... }, ref) => { ... })
    // Or:    function Button({ kind = 'primary', ... }: ButtonProps) { ... }

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer) {
          extractDefaultsFromExpression(decl.initializer, defaults, sourceFile);
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name?.text === componentName) {
      for (const param of node.parameters) {
        extractDefaultsFromBinding(param, defaults, sourceFile);
      }
    }
  });

  return defaults;
}

function extractDefaultsFromExpression(
  node: ts.Node,
  defaults: Map<string, string>,
  sourceFile: ts.SourceFile
): void {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    for (const param of node.parameters) {
      extractDefaultsFromBinding(param, defaults, sourceFile);
    }
    return;
  }

  // Handle forwardRef((...) => { ... }) and memo((...) => { ... })
  if (ts.isCallExpression(node)) {
    for (const arg of node.arguments) {
      extractDefaultsFromExpression(arg, defaults, sourceFile);
    }
  }
}

function extractDefaultsFromBinding(
  param: ts.ParameterDeclaration,
  defaults: Map<string, string>,
  sourceFile: ts.SourceFile
): void {
  if (!ts.isObjectBindingPattern(param.name)) return;

  for (const element of param.name.elements) {
    if (element.initializer) {
      const name = element.propertyName
        ? element.propertyName.getText(sourceFile)
        : element.name.getText(sourceFile);
      const value = element.initializer.getText(sourceFile);
      defaults.set(name, cleanDefaultValue(value));
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function getJsDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges) return undefined;

  for (const range of ranges) {
    const comment = fullText.slice(range.pos, range.end);
    if (comment.startsWith('/**')) {
      // Extract text from JSDoc comment
      return comment
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .trim();
    }
  }
  return undefined;
}

function simplifyType(typeStr: string, _aliases: Map<string, PropTypeAlias>): string {
  // Clean up common React types
  let t = typeStr;
  t = t.replace(/React\.ReactNode/g, 'ReactNode');
  t = t.replace(/React\.ReactElement/g, 'ReactElement');
  t = t.replace(/React\.CSSProperties/g, 'CSSProperties');
  t = t.replace(/React\.MouseEvent<[^>]+>/g, 'MouseEvent');
  return t;
}

function cleanDefaultValue(value: string): string {
  // Remove surrounding quotes from string literals for cleanliness
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

// ── Bulk extraction for entire bundle ───────────────────────────────

export function extractAllProps(
  sources: Record<string, Array<{ path: string; content: string }>>
): Record<string, ComponentPropDetails> {
  const results: Record<string, ComponentPropDetails> = {};

  for (const [key, files] of Object.entries(sources)) {
    const componentName = key.split(':')[0];
    const details = extractComponentProps(componentName, files);
    if (details && details.props.length > 0) {
      results[componentName] = details;
    }
  }

  return results;
}
