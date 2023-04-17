import { RootNode } from '@splitflow/core/ast'
import { astToStyle, SplitflowStyleDef } from '@splitflow/core/style'
import { mergeObject } from '@splitflow/core/utils/object'
import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'
import { CLIError } from './error'

const AST_ENDPOINT = 'https://main.splitflow.workers.dev/ast'

const FILE_SCANNER = new FileScanner({
    filter: (fileName) => fileName.match(/^([^\.]*)\.sf\.(ts|js)$/)?.[1]
})

export interface StyleOptions {
    projectId?: string
    ast?: string
    clear?: boolean
}

export default async function style(options: StyleOptions) {
    const [ast, mapping] = await Promise.all([
        options.ast ? getASTFromFile(options.ast) : getASTFromServer(options.projectId!),
        FILE_SCANNER.scan()
    ])

    await Promise.all(
        (function* () {
            for (const [componentName, styleDef] of astToStyle(ast)) {
                const filePath = mapping.get(componentName)
                if (filePath) {
                    yield mergeSFFile(filePath, componentName, styleDef)
                } else {
                    console.warn(`File ${componentName}.sf.(ts|js) is missing`)
                }
            }
        })()
    )

    if (options.clear && !options.ast) {
        await deleteASTFromServer(options.projectId!, await saveASTToFile(ast))
    }
}

async function mergeSFFile(filePath: string, componentName: string, styleDef: SplitflowStyleDef) {
    const oldStyleDef = parseSFFileTemplate(await readFile(filePath, { encoding: 'utf8' }))
    const newStyleDef = mergeObject(oldStyleDef, styleDef, { deleteNullProps: true })
    await writeFile(filePath, sfFileTemplate(componentName, newStyleDef))
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

async function getASTFromServer(projectId: string): Promise<RootNode> {
    const response = await fetch(path.join(AST_ENDPOINT, projectId))
    if (response.status === 200) {
        return response.json()
    }
    if (response.status === 400) {
        throw new CLIError('Failed to load AST', (await response.json()).error)
    }
    throw new Error(response.statusText)
}

async function getASTFromFile(astPath: string): Promise<RootNode> {
    const text = await readFile(path.join(process.cwd(), astPath), { encoding: 'utf8' })
    return JSON.parse(text)
}

async function saveASTToFile(ast: RootNode): Promise<string> {
    const data = JSON.stringify(ast)
    const checksum = crypto.createHash('sha256').update(data).digest('hex')

    await writeFile(path.join(process.cwd(), `ast-${new Date().toISOString()}.json`), data)
    return checksum
}

async function deleteASTFromServer(projectId: string, checksum: string): Promise<void> {
    const response = await fetch(path.join(AST_ENDPOINT, projectId), {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ checksum })
    })

    if (response.status === 200) return
    if (response.status === 400) {
        throw new CLIError('Failed to clear AST', (await response.json()).error)
    }
    throw new Error(response.statusText)
}
