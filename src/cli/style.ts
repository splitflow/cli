import { StyleNode, SplitflowStyleDef, styleToDef } from '@splitflow/lib/style'
import { merge } from '@splitflow/core/utils'
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
    appId?: string
    framework?: string
    ast?: string
    clear?: boolean
}

export default async function style(options: StyleOptions) {
    const [ast, mapping] = await Promise.all([
        options.ast ? getASTFromFile(options.ast) : getASTFromServer(options.appId!),
        FILE_SCANNER.scan()
    ])

    await Promise.all(
        (function* () {
            for (const [componentName, styleDef] of styleToDef(ast)) {
                const filePath = mapping.get(componentName)
                if (filePath) {
                    yield mergeSFFile(
                        filePath,
                        componentName,
                        styleDef,
                        template(options.framework)
                    )
                } else {
                    console.warn(`File ${componentName}.sf.(ts|js) is missing`)
                }
            }
        })()
    )

    if (options.clear && !options.ast) {
        await deleteASTFromServer(options.appId!, await saveASTToFile(ast))
    }
}

async function mergeSFFile(
    filePath: string,
    componentName: string,
    styleDef: SplitflowStyleDef,
    template: (componentName: string, styleDef: SplitflowStyleDef) => string
) {
    const oldStyleDef = parseSFFileTemplate(await readFile(filePath, { encoding: 'utf8' }))
    const newStyleDef = merge(oldStyleDef, styleDef, { deleteNullProps: true })
    await writeFile(filePath, template(componentName, newStyleDef))
}

const STYLE_DEF_REGEX = /createStyle\([^,]+,([^)]+)\)/

function parseSFFileTemplate(fileContent: string): SplitflowStyleDef {
    const match = fileContent.match(STYLE_DEF_REGEX)
    if (match) return JSON.parse(format(match[1]))
    return {}
}

function template(framework: string) {
    switch (framework) {
        case 'svelte':
            return sfSvelteFileTemplate
        default:
            return sfJavascriptFileTemplate
    }
}

function sfJavascriptFileTemplate(componentName: string, styleDef: SplitflowStyleDef) {
    return `
import { createStyle } from '@splitflow/designer'

export const style = createStyle('${componentName}', ${JSON.stringify(styleDef, null, 4)})
`
}

function sfSvelteFileTemplate(componentName: string, styleDef: SplitflowStyleDef) {
    return `
import { createStyle as _createStyle } from '@splitflow/designer'
import { createStyle as __createStyle } from '@splitflow/designer/svelte'

export function createStyle() {
    return __createStyle(style)
}

export const style = _createStyle('${componentName}', ${JSON.stringify(styleDef, null, 4)})
`
}

async function getASTFromServer(appId: string): Promise<StyleNode> {
    const response = await fetch(path.join(AST_ENDPOINT, appId))
    if (response.status === 200) {
        return response.json()
    }
    if (response.status === 400) {
        throw new CLIError('Failed to load AST', (await response.json()).error)
    }
    throw new Error(response.statusText)
}

async function getASTFromFile(astPath: string): Promise<StyleNode> {
    const text = await readFile(path.join(process.cwd(), astPath), { encoding: 'utf8' })
    return JSON.parse(text)
}

async function saveASTToFile(ast: StyleNode): Promise<string> {
    const data = JSON.stringify(ast)
    const checksum = crypto.createHash('sha256').update(data).digest('hex')

    await writeFile(path.join(process.cwd(), `ast-${new Date().toISOString()}.json`), data)
    return checksum
}

async function deleteASTFromServer(appId: string, checksum: string): Promise<void> {
    const response = await fetch(path.join(AST_ENDPOINT, appId), {
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
