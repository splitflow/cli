import { actionRequestX, getResult } from '@splitflow/lib'
import { StyleNode, SplitflowStyleDef, styleToDef } from '@splitflow/lib/style'
import { merge } from '@splitflow/core/utils'
import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'
import { CLIError } from './error'
import {
    GetDesignAction,
    GetDesignEndpoint,
    GetDesignResult,
    ResetDesignAction,
    ResetDesignEndpoint,
    ResetDesignResult
} from '@splitflow/lib/design'
import { CliKit, createCliKit } from './cli'

const FILE_SCANNER = new FileScanner({
    filter: (fileName) => fileName.match(/^([^\.]*)\.sf\.(ts|js)$/)?.[1]
})

export interface StyleOptions {
    accountId?: string
    appId?: string
    framework?: string
    style?: string
    clear?: boolean
}

export default async function style(options: StyleOptions) {
    const kit = createCliKit(options)

    const [style, mapping] = await Promise.all([
        options.style ? getStyleFromFile(options.style) : getStyleFromServer(kit),
        FILE_SCANNER.scan()
    ])

    await Promise.all(
        (function* () {
            for (const [componentName, styleDef] of styleToDef(style)) {
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

    if (options.clear && !options.style) {
        await deleteStyleFromServer(kit, await saveStyleToFile(style))
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

async function getStyleFromServer(kit: CliKit): Promise<StyleNode> {
    const { accountId, appId: podId } = kit.config

    const action: GetDesignAction = {
        type: 'get-design',
        accountId,
        podId,
        podType: 'apps',
        style: true
    }
    const response = kit.gateway.fetch(actionRequestX(action, GetDesignEndpoint))
    const { style, error } = await getResult<GetDesignResult>(response)

    if (style) return style
    throw new CLIError('Failed to load Style', error.message)
}

async function getStyleFromFile(stylePath: string): Promise<StyleNode> {
    const text = await readFile(path.join(process.cwd(), stylePath), { encoding: 'utf8' })
    return JSON.parse(text)
}

async function saveStyleToFile(style: StyleNode): Promise<string> {
    const data = JSON.stringify({ style })
    const checksum = crypto.createHash('sha256').update(data).digest('hex')

    await writeFile(path.join(process.cwd(), `style-${new Date().toISOString()}.json`), data)
    return checksum
}

async function deleteStyleFromServer(kit: CliKit, styleChecksum: string): Promise<void> {
    const { accountId, appId: podId } = kit.config

    const action: ResetDesignAction = {
        type: 'reset-design',
        accountId,
        podId,
        podType: 'apps',
        styleChecksum
    }
    const response = kit.gateway.fetch(actionRequestX(action, ResetDesignEndpoint))
    const { error } = await getResult<ResetDesignResult>(response)

    if (error) throw new CLIError('Failed to reset Style', error.message)
}
