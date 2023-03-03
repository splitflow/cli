import { DefinitionNode, RootNode } from 'core/ast'
import { astToStyle } from 'core/style'
import { merge } from 'core/utils/object'
import { readdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const AST_ENDPOINT = 'https://main.splitflow.workers.dev/ast'

interface SplitflowStyleDef {
    [definitionName: string]: DefinitionNode
}

export interface StyleOptions {
    projectId?: string
    ast?: string
}

export default async function style(options: StyleOptions) {
    const [ast, mapping] = await Promise.all([getAST(options), scanSFFiles()])

    const promises = []
    for (const [componentName, styleDef] of astToStyle(ast)) {
        const filePath = mapping.get(componentName)
        if (filePath) {
            promises.push(mergeSFFile(filePath, componentName, styleDef))
        } else {
            console.warn(`File ${componentName}.sf.(ts|js) is missing`)
        }
    }

    await Promise.all(promises)
}

async function mergeSFFile(filePath: string, componentName: string, styleDef: SplitflowStyleDef) {
    const oldStyleDef = parseSFFileTemplate(await readFile(filePath, { encoding: 'utf8' }))
    await writeFile(filePath, sfFileTemplate(componentName, merge(oldStyleDef, styleDef)))
}

const STYLE_DEF_REGEX = /createStyle\([^,]+,([^)]+)\)/

function parseSFFileTemplate(fileContent: string): SplitflowStyleDef {
    const match = fileContent.match(STYLE_DEF_REGEX)
    if (match) return JSON.parse(match[1])
    return {}
}

function sfFileTemplate(componentName: string, styleDef: SplitflowStyleDef) {
    return `
import { createStyle } from '@splitflow/designer/style'

export const style = createStyle('${componentName}', ${JSON.stringify(styleDef, null, 4)})
`
}

function getAST(options: StyleOptions): Promise<RootNode> {
    if (options.ast) return getASTFromFile(options.ast)
    return getASTFromServer(options.projectId!)
}

async function getASTFromServer(projectId: string): Promise<RootNode> {
    const response = await fetch(path.join(AST_ENDPOINT, projectId))
    if (response.status === 200) {
        return response.json()
    }
    throw 'Failed to load AST'
}

async function getASTFromFile(astPath: string): Promise<RootNode> {
    const text = await readFile(path.join(process.cwd(), astPath), { encoding: 'utf8' })
    return JSON.parse(text)
}

async function scanSFFiles() {
    const result = new Map<string, string>()
    await scan(
        result,
        path.join(process.cwd()),
        (dirName) => dirName !== 'node_modules',
        (fileName) => fileName.match(/^([^\.]*)\.sf\.(ts|js)$/)?.[1]
    )
    return result
}

async function scan(
    result: Map<string, string>,
    dirPath: string,
    include: (dirName: string) => boolean,
    filter: (fileName: string) => string | undefined
) {
    const entries = await readdir(dirPath, { withFileTypes: true })

    const promises: Promise<void>[] = []
    for (const entry of entries) {
        if (entry.isDirectory() && include(entry.name)) {
            promises.push(scan(result, path.join(dirPath, entry.name), include, filter))
        } else if (entry.isFile()) {
            const key = filter(entry.name)

            if (key) {
                result.set(key, path.join(dirPath, entry.name))
            }
        }
    }

    await Promise.all(promises)
}
