import { Project, SyntaxKind } from "ts-morph"
export type ExportKind = "normal" | "default" | "none"
export interface Position { line: number; column: number }
export interface Range { start: Position; end: Position }
export interface DecoratorInfo { name: string; arguments?: string[]; text?: string }
export interface ParamInfo { name: string; isJSType: boolean; type?: string; default?: string; defaultParsed?: string|number|boolean|null; typeAst?: any; decorators?: DecoratorInfo[]; loc?: Range }
export interface TypeParameterInfo { name: string; constraint?: string; default?: string }
export interface BaseItem { name: string | null; type: string; level: "top" | "sub"; exports?: ExportKind; jsdoc?: string; decorators?: DecoratorInfo[]; loc?: Range }

export interface VariableItem extends BaseItem {
  subtype?: "constant" | "let" | "var";
  value?: string | number | boolean | null;
  valueText?: string;
  valueParsed?: any;
  arguments?: any[];
}
export interface FunctionItem extends BaseItem {
  arguments: ParamInfo[];
  typeParameters?: TypeParameterInfo[];
  returnType?: string;
  returnTypeAst?: any;
}
export interface ClassMemberProperty { name: string; private?: boolean; static?: boolean; readonly?: boolean; value?: string | number | boolean | null; type?: string; decorators?: DecoratorInfo[]; loc?: Range }
export interface ClassMemberConstructor { type: "constructor"; for: string; function: FunctionItem }

export interface MethodParamInfo extends ParamInfo { optional?: boolean; default?: string }
export interface MethodItem {
  name: string
  accessibility?: "public" | "private" | "protected"
  static?: boolean
  async?: boolean
  abstract?: boolean
  isGetter?: boolean
  isSetter?: boolean
  readonly?: boolean
  arguments: MethodParamInfo[]
  typeParameters?: TypeParameterInfo[]
  returnType?: string
  returnTypeAst?: any
  decorators?: DecoratorInfo[]
  loc?: Range
  jsdoc?: string
}
export interface ClassMemberMethod extends MethodItem { }
export interface IndexSignature { keyType?: string; returnType?: string; readonly?: boolean }
export interface TypeAliasItem extends BaseItem { target?: string; typeParameters?: TypeParameterInfo[] }
export interface EnumMember { name: string; value?: string | number | boolean | null; jsdoc?: string }
export interface EnumItem extends BaseItem { const?: boolean; members: EnumMember[] }
export interface NamespaceItem extends BaseItem { members: ParsedItem[] }
export interface InterfaceMemberProperty { name: string; optional?: boolean; readonly?: boolean; type?: string; jsdoc?: string; loc?: Range }
export interface InterfaceMemberMethod { name: string; arguments: ParamInfo[]; returnType?: string; optional?: boolean; jsdoc?: string; loc?: Range }
export interface InterfaceItem extends BaseItem { members: Array<InterfaceMemberProperty | InterfaceMemberMethod | IndexSignature> }
export interface ClassItem extends BaseItem { items: Array<ClassMemberConstructor | ClassMemberProperty | ClassMemberMethod | IndexSignature> }
export type ParsedItem = VariableItem | FunctionItem | ClassItem | InterfaceItem | TypeAliasItem | EnumItem | NamespaceItem

function getJsDocText(node: any): string {
  return (node.getJsDocs?.() ?? [])
    .map((d: any) => d.getInnerText())
    .join("\n")
    .trim();
}

function literalValueText(init: any) {
  if (!init) return undefined
  const k = init.getKind?.() ?? init.kind
  if (!k) return undefined
  switch (k) {
    case SyntaxKind.StringLiteral: return init.getLiteralText()
    case SyntaxKind.NumericLiteral: return Number(init.getText())
    case SyntaxKind.TrueKeyword: return true
    case SyntaxKind.FalseKeyword: return false
    case SyntaxKind.NullKeyword: return null
    default: return init.getText?.()?.slice?.(0, 200)
  }
}
function paramInfo(param: any): ParamInfo {
  const init = param.getInitializer?.()
  return {
    name: param.getName?.() ?? String(param.getText?.() ?? ""),
    isJSType: Boolean(param.getTypeNode?.()),
    type: param.getTypeNode?.()?.getText?.(),
    default: init?.getText?.(),
    defaultParsed: literalValueText(init),
    typeAst: parseTypeNode(param.getTypeNode?.()),
    decorators: parseDecorators(param) ?? undefined,
    loc: locOf(param) ?? undefined,
  }
}

function methodParamInfo(param: any): MethodParamInfo {
  return { ...paramInfo(param), optional: param.isOptional?.() ?? false }
}

function typeParamsOf(node: any): TypeParameterInfo[] | undefined {
  const tps = node.getTypeParameters?.() ?? []
  if (!tps.length) return undefined
  return tps.map((tp: any) => ({ name: tp.getName?.() ?? "", constraint: tp.getConstraint?.()?.getText?.(), default: tp.getDefault?.()?.getText?.() }))
}

function locOf(node: any): Range | undefined {
  try {
    const src = node.getSourceFile?.() ?? node.getSourceFile?.()
    const start = node.getStart?.() ?? node.getPos?.()
    const end = node.getEnd?.() ?? node.getEnd?.()
    if (!src || start == null || end == null) return undefined
    const s = src.getLineAndColumnAtPos(start)
    const e = src.getLineAndColumnAtPos(end)
    return { start: { line: s.line, column: s.column }, end: { line: e.line, column: e.column } }
  } catch {
    return undefined
  }
}

function parseDecorators(node: any): DecoratorInfo[] | undefined {
  const decs = node.getDecorators?.() ?? []
  if (!decs.length) return undefined
  return decs.map((d: any) => ({ name: d.getName?.() ?? d.getExpression?.()?.getExpression?.()?.getText?.() ?? d.getExpression?.()?.getText?.(), arguments: (d.getArguments?.() ?? []).map((a: any) => a.getText?.() ?? String(a)), text: d.getText?.() }))
}

function parseTypeNode(node: any): any {
  if (!node) return undefined
  const kind = node.getKindName?.() ?? node.getKind?.() ?? node.kind
  const text = node.getText?.() ?? String(node)
  try {
    const k = node.getKind?.() ?? node.kind

    const parseElements = (elts: any[] | undefined) => (elts ?? []).map((e: any) => {
      try {
        if (!e) return undefined
        const name = e.getName?.()?.getText?.() ?? e.getText?.()
        const txt = e.getText?.() ?? String(e)
        return { name, optional: e.hasQuestionToken?.() ?? false, rest: txt.trim().startsWith('...'), type: parseTypeNode(e.getTypeNode?.() ?? e) }
      } catch {
        return parseTypeNode(e)
      }
    })

    switch (k) {
      case SyntaxKind.UnionType:
        return { kind: "union", text, types: (node.getTypeNodes?.() ?? node.types ?? []).map(parseTypeNode) }
      case SyntaxKind.IntersectionType:
        return { kind: "intersection", text, types: (node.getTypeNodes?.() ?? node.types ?? []).map(parseTypeNode) }
      case SyntaxKind.ArrayType:
        return { kind: "array", text, element: parseTypeNode(node.getElementTypeNode?.() ?? node.elementType) }
      case SyntaxKind.TupleType:
        return { kind: "tuple", text, elements: (node.getElements?.() ?? node.getElementTypes?.() ?? node.elementTypes ?? []).map(parseTypeNode) }
      case SyntaxKind.OptionalType:
        return { kind: "optional", text, type: parseTypeNode(node.getType?.() ?? node.elementType) }
      case SyntaxKind.RestType:
        return { kind: "rest", text, type: parseTypeNode(node.getType?.() ?? node.elementType) }
      case SyntaxKind.LiteralType:
        return { kind: "literal", text, value: node.getLiteral?.()?.getText?.() ?? text }
      case SyntaxKind.TemplateLiteralType:
        return { kind: "template-literal", text, spans: (node.getTemplateSpans?.() ?? []).map((s: any) => ({ type: parseTypeNode(s.getType?.()), literal: s.getLiteral?.()?.getText?.() })) }
      case SyntaxKind.FunctionType:
        return {
          kind: "function",
          text,
          parameters: (node.getParameters?.() ?? []).map((p: any) => ({ name: p.getName?.(), type: p.getTypeNode?.()?.getText?.(), typeAst: parseTypeNode(p.getTypeNode?.()) })),
          returnType: node.getReturnType?.()?.getText?.(),
          returnTypeAst: parseTypeNode(node.getReturnType?.())
        }
      case SyntaxKind.ParenthesizedType:
        return { kind: "parenthesized", text, type: parseTypeNode(node.getType?.()) }
      case SyntaxKind.TypeReference: {
        const typeName = node.getTypeName?.()?.getText?.() ?? node.getText?.()
        return { kind: "reference", text, name: typeName, typeArguments: (node.getTypeArguments?.() ?? []).map(parseTypeNode) }
      }
      case SyntaxKind.TypeOperator:
        return { kind: "type-operator", text, operator: node.getOperator?.()?.getText?.() ?? node.getOperator?.(), type: parseTypeNode(node.getType?.()) }
      case SyntaxKind.IndexedAccessType:
        return { kind: "indexed-access", text, objectType: parseTypeNode(node.getObjectType?.()), indexType: parseTypeNode(node.getIndexType?.()) }
      case SyntaxKind.MappedType:
        return { kind: "mapped", text, typeParameter: node.getTypeParameter?.()?.getText?.(), nameType: node.getNameType?.()?.getText?.(), optional: node.getQuestionToken?.()?.getText?.(), readonly: node.getReadonlyToken?.()?.getText?.(), type: parseTypeNode(node.getType?.()) }
      case SyntaxKind.ConditionalType:
        return { kind: "conditional", text, checkType: parseTypeNode(node.getCheckType?.()), extendsType: parseTypeNode(node.getExtendsType?.()), trueType: parseTypeNode(node.getTrueType?.()), falseType: parseTypeNode(node.getFalseType?.()) }
      case SyntaxKind.TypePredicate:
        return { kind: "predicate", text, parameterName: node.getParameterName?.()?.getText?.(), asserts: Boolean(node.getAssertKeyword?.()), type: parseTypeNode(node.getType?.()) }
      case SyntaxKind.TypeQuery:
        return { kind: "type-query", text, exprName: node.getExprName?.()?.getText?.() ?? node.getText?.() }
      case SyntaxKind.InferType:
        return { kind: "infer", text, typeParameter: node.getTypeParameter?.()?.getText?.() }
      case SyntaxKind.TemplateLiteralType:
        return { kind: "template-literal", text }
      case SyntaxKind.TypeLiteral:
        return { kind: "object", text, properties: (node.getMembers?.() ?? []).map((m: any) => ({ name: m.getName?.() ?? "", type: m.getTypeNode?.()?.getText?.(), typeAst: parseTypeNode(m.getTypeNode?.()), readonly: m.hasModifier?.("readonly") ?? false })) }
      case SyntaxKind.TupleType:
        return { kind: "tuple", text, elements: (node.getElementTypes?.() ?? []).map(parseTypeNode) }
      case SyntaxKind.ImportType:
        return { kind: "import", text, argument: node.getArgument?.()?.getText?.() ?? node.getText?.() }
      default:
        // fallback: include available shorthand text and preserve node.kindName when possible
        return { kind: "unknown", kindName: kind, text }
    }
  } catch (err) {
    return { kind: "unknown", text, error: String(err) }
  }
}

function functionLikeToItem(fn: any, level: "top" | "sub" = "top"): FunctionItem {
  return {
    name: fn.getName?.() ?? null,
    type: "function",
    level,
    exports: fn.isDefaultExport?.() ? "default" : fn.isExported?.() ? "normal" : "none",
    jsdoc: getJsDocText(fn),
    decorators: parseDecorators(fn) ?? undefined,
    loc: locOf(fn) ?? undefined,
    arguments: (fn.getParameters?.() ?? []).map(paramInfo),
    typeParameters: typeParamsOf(fn),
    returnType: fn.getReturnTypeNode?.()?.getText?.(),
    returnTypeAst: parseTypeNode(fn.getReturnTypeNode?.()),
  }
}

export function parseWithTsMorph(sourceText: string, fileName = "file.ts"): ParsedItem[] {
  const isProbablyTS = /\b(interface|type\s+\w+\s*=|:\s*\w|enum\s+\w+)\b/.test(sourceText)
  const autoName = fileName === "file.ts" ? `file.${isProbablyTS ? "ts" : "js"}` : fileName
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true, checkJs: false } })
  const src = project.createSourceFile(autoName, sourceText, { overwrite: true })
  const out: ParsedItem[] = []

  for (const stmt of src.getStatements()) {
    const vs = stmt.asKind(SyntaxKind.VariableStatement)
    if (vs) {
      const kind = vs.getDeclarationKind?.()
      for (const d of vs.getDeclarationList().getDeclarations()) {
        const init = d.getInitializer?.()
        out.push({ name: d.getName(), type: "variable", subtype: kind === "const" ? "constant" : kind === "let" ? "let" : "var", value: literalValueText(init), valueText: init?.getText?.(), valueParsed: literalValueText(init), exports: vs.isDefaultExport?.() ? "default" : vs.isExported?.() ? "normal" : "none", level: "top", jsdoc: getJsDocText(d), decorators: parseDecorators(d) ?? undefined, loc: locOf(d) ?? undefined, arguments: [] })
      }
      continue
    }

    const fd = stmt.asKind(SyntaxKind.FunctionDeclaration)
    if (fd) { out.push(functionLikeToItem(fd, "top")); continue }

    const ta = stmt.asKind(SyntaxKind.TypeAliasDeclaration)
    if (ta) {
      out.push({ name: ta.getName?.() ?? null, type: "type-alias", level: "top", exports: ta.isDefaultExport?.() ? "default" : ta.isExported?.() ? "normal" : "none", jsdoc: getJsDocText(ta), target: ta.getTypeNode?.()?.getText?.() ?? ta.getType?.()?.getText?.(), typeParameters: typeParamsOf(ta) })
      continue
    }

    const ed = stmt.asKind(SyntaxKind.EnumDeclaration)
    if (ed) {
      const members: EnumMember[] = []
      for (const m of ed.getMembers()) {
        members.push({ name: m.getName?.() ?? "", value: literalValueText(m.getInitializer?.()), jsdoc: getJsDocText(m) })
      }
      out.push({ name: ed.getName?.() ?? null, type: "enum", level: "top", exports: ed.isDefaultExport?.() ? "default" : ed.isExported?.() ? "normal" : "none", jsdoc: getJsDocText(ed), const: ed.isConstEnum?.() ?? false, members })
      continue
    }

    const ea = stmt.asKind(SyntaxKind.ExportAssignment)
    if (ea) {
      const expr = ea.getExpression?.()
      if (!expr) continue
      const k = expr.getKindName?.()
      if (k === "FunctionExpression" || k === "ArrowFunction") { const f = functionLikeToItem(expr, "top"); f.exports = "default"; out.push(f); continue }
      const id = expr.getText?.()
      if (id) {
        const vd = src.getVariableDeclaration(id)
        if (vd) out.push({ name: vd.getName(), type: "variable", subtype: "constant", value: literalValueText(vd.getInitializer?.()), exports: "default", level: "top", jsdoc: getJsDocText(vd), arguments: [] })
      }
      continue
    }

    const cd = stmt.asKind(SyntaxKind.ClassDeclaration)
    if (cd) {
      const members: Array<ClassMemberConstructor | ClassMemberProperty | ClassMemberMethod | IndexSignature> = []
      for (const m of cd.getMembers()) {
        const ctor = m.asKind?.(SyntaxKind.Constructor)
        if (ctor) { members.push({ type: "constructor", for: cd.getName?.() ?? "", function: functionLikeToItem(ctor, "sub") }); continue }

        const meth = m.asKind?.(SyntaxKind.MethodDeclaration)
        if (meth) {
          members.push({
            name: meth.getName?.() ?? "",
            accessibility: meth.hasModifier?.("private") ? "private" : meth.hasModifier?.("protected") ? "protected" : undefined,
            static: meth.isStatic?.() ?? false,
            async: meth.isAsync?.() ?? false,
            abstract: meth.isAbstract?.() ?? false,
            decorators: parseDecorators(meth) ?? undefined,
            arguments: (meth.getParameters?.() ?? []).map(methodParamInfo),
            typeParameters: typeParamsOf(meth),
            returnType: meth.getReturnTypeNode?.()?.getText?.(),
            returnTypeAst: parseTypeNode(meth.getReturnTypeNode?.()),
            jsdoc: getJsDocText(meth),
            loc: locOf(meth) ?? undefined,
          })
          continue
        }

        const getter = m.asKind?.(SyntaxKind.GetAccessor)
        if (getter) { members.push({ name: getter.getName?.() ?? "", isGetter: true, arguments: [], returnType: getter.getReturnTypeNode?.()?.getText?.(), jsdoc: getJsDocText(getter) }); continue }
        const setter = m.asKind?.(SyntaxKind.SetAccessor)
        if (setter) { members.push({ name: setter.getName?.() ?? "", isSetter: true, arguments: (setter.getParameters?.() ?? []).map(methodParamInfo), jsdoc: getJsDocText(setter) }); continue }

        const prop = m.asKind?.(SyntaxKind.PropertyDeclaration)
        if (prop) { const name = prop.getName?.() ?? ""; members.push({ name, private: prop.hasModifier?.("private") || name.startsWith("#"), static: prop.isStatic?.() ?? false, readonly: prop.isReadonly?.() ?? false, value: literalValueText(prop.getInitializer?.()) }); continue }

        const idx = m.asKind?.(SyntaxKind.IndexSignature)
        if (idx) {
          const txt = idx.getText?.() ?? ""
          const mKey = txt.match(/\[\s*[^:]+:\s*([^\]]+)\]/)
          const keyType = mKey ? mKey[1].trim() : undefined
          const returnType = idx.getReturnTypeNode?.()?.getText?.() ?? (txt.match(/:\s*([^;\]]+)$/)?.[1]?.trim())
          members.push({ keyType, returnType, readonly: idx.hasModifier?.("readonly") ?? false })
          continue
        }
      }
      out.push({ name: cd.getName?.() ?? null, type: "class", level: "top", exports: cd.isDefaultExport?.() ? "default" : cd.isExported?.() ? "normal" : "none", jsdoc: getJsDocText(cd), items: members, typeParameters: typeParamsOf(cd) })
      continue
    }

    const id = stmt.asKind(SyntaxKind.InterfaceDeclaration)
    if (id) {
      const members: Array<InterfaceMemberProperty | InterfaceMemberMethod | IndexSignature> = []
      for (const m of id.getMembers()) {
        const prop = m.asKind?.(SyntaxKind.PropertySignature)
        if (prop) {
          members.push({ name: prop.getName?.() ?? "", optional: prop.hasQuestionToken?.() ?? false, readonly: prop.hasModifier?.("readonly") ?? false, type: prop.getTypeNode?.()?.getText?.(), jsdoc: getJsDocText(prop) })
          continue
        }
        const ms = m.asKind?.(SyntaxKind.MethodSignature)
        if (ms) {
          members.push({ name: ms.getName?.() ?? "", arguments: (ms.getParameters?.() ?? []).map(paramInfo), returnType: ms.getReturnTypeNode?.()?.getText?.(), optional: ms.hasQuestionToken?.() ?? false, jsdoc: getJsDocText(ms) })
          continue
        }
        const idx = m.asKind?.(SyntaxKind.IndexSignature)
        if (idx) {
          const txt = idx.getText?.() ?? ""
          const mKey = txt.match(/\[\s*[^:]+:\s*([^\]]+)\]/)
          const keyType = mKey ? mKey[1].trim() : undefined
          const returnType = idx.getReturnTypeNode?.()?.getText?.() ?? (txt.match(/:\s*([^;\]]+)$/)?.[1]?.trim())
          members.push({ keyType, returnType, readonly: idx.hasModifier?.("readonly") ?? false })
          continue
        }
      }
      out.push({ name: id.getName?.() ?? null, type: "interface", level: "top", exports: id.isDefaultExport?.() ? "default" : id.isExported?.() ? "normal" : "none", jsdoc: getJsDocText(id), members, typeParameters: typeParamsOf(id) })
      continue
    }

    const md = stmt.asKind(SyntaxKind.ModuleDeclaration)
    if (md) {
      const body = md.getBody?.()
      const members: ParsedItem[] = []
      if (body && (body as any).getStatements) {
        for (const s of (body as any).getStatements()) {
          const tmp = Project.prototype.createSourceFile!.call(src.getProject(), "__tmp.ts", s.getText(), { overwrite: true })
          members.push(...parseWithTsMorph(tmp.getFullText(), "__tmp.ts").map((it) => ({ ...it, level: "sub" } as ParsedItem)))
        }
      }
      out.push({ name: md.getName?.() ?? null, type: "namespace", level: "top", exports: md.isExported?.() ? "normal" : "none", jsdoc: getJsDocText(md), members })
      continue
    }
  }

  return out
}

export const parser = {
  parse: parseWithTsMorph,
  parseWithTsMorph,
}
export type Parser = typeof parser
