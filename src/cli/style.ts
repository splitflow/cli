import { RootNode } from '@splitflow/core/ast'
import { astToStyle, SplitflowStyleDef } from '@splitflow/core/style'
import { merge } from '@splitflow/core/utils/object'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'

const AST_ENDPOINT = 'https://main.splitflow.workers.dev/ast'

export interface StyleOptions {
    projectId?: string
    ast?: string
}

export default async function style(options: StyleOptions) {
    const fileScanner = new FileScanner({
        filter: (fileName) => fileName.match(/^([^\.]*)\.sf\.(ts|js)$/)?.[1]
    })

    const [ast, mapping] = await Promise.all([getAST(options), fileScanner.scan()])

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
    if (match) return JSON.parse(format(match[1]))
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
