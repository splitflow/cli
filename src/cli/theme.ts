import { merge } from '@splitflow/core/utils'
import { actionRequestX, getResult } from '@splitflow/lib'
import { ThemeNode, ThemeDataNode } from '@splitflow/lib/style'
import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'
import { CLIError } from './error'
import {
    GetThemeAction,
    GetThemeEndpoint,
    GetThemeResult,
    ResetThemeAction,
    ResetThemeEndpoint,
    ResetThemeResult
} from '@splitflow/lib/design'
import { CliKit, createCliKit } from './cli'

const FILE_SCANNER = new FileScanner({
    filter: (fileName) => fileName.match(/^([^\.]*)\.sft\.(ts|js)$/)?.[1]
})

export interface ThemeOptions {
    accountId?: string
    framework?: string
    theme?: string
    clear?: boolean
}

export default async function theme(options: ThemeOptions) {
    const kit = createCliKit(options)

    const [theme, mapping] = await Promise.all([
        options.theme ? getThemeFromFile(options.theme) : getThemeFromServer(kit),
        FILE_SCANNER.scan()
    ])

    await Promise.all(
        (function* () {
            for (const [themeName, themeData] of Object.entries(theme)) {
                const filePath = mapping.get(themeName)
                if (filePath) {
                    yield mergeSFThemeFile(
                        filePath,
                        themeName,
                        themeData,
                        template(options.framework)
                    )
                } else {
                    console.warn(`File ${themeName}.sft.(ts|js) is missing`)
                }
            }
        })()
    )

    if (options.clear && !options.theme) {
        await deleteThemeFromServer(kit, await saveThemeToFile(theme))
    }
}

async function mergeSFThemeFile(
    filePath: string,
    themeName: string,
    themeData: ThemeDataNode,
    template: (themeName: string, themeData: ThemeDataNode) => string
) {
    const oldThemeData = parseSFThemeFileTemplate(await readFile(filePath, { encoding: 'utf8' }))
    const newThemeData = merge(oldThemeData, themeData, { deleteNullProps: true })
    await writeFile(filePath, template(themeName, newThemeData))
}

const THEME_DATA_REGEX = /createTheme\([^,]+,([^)]+)\)/

function parseSFThemeFileTemplate(fileContent: string): ThemeDataNode {
    const match = fileContent.match(THEME_DATA_REGEX)
    if (match) return JSON.parse(format(match[1]))
    return {}
}

function template(framework: string) {
    switch (framework) {
        case 'svelte':
            return sfSvelteThemeFileTemplate
        default:
            return sfJavascriptThemeFileTemplate
    }
}

function sfJavascriptThemeFileTemplate(themeName: string, themeData: ThemeDataNode) {
    return `
import { createTheme } from '@splitflow/designer'

export const theme = createTheme('${themeName}', ${JSON.stringify(themeData, null, 4)})
`
}

function sfSvelteThemeFileTemplate(themeName: string, themeData: ThemeDataNode) {
    return `
import { createTheme as _createTheme } from '@splitflow/designer'
import { createTheme as __createTheme } from '@splitflow/designer/svelte'

export function createTheme() {
    return __createTheme(theme)
}

export const theme = _createTheme('${themeName}', ${JSON.stringify(themeData, null, 4)})
`
}

async function getThemeFromServer(kit: CliKit): Promise<ThemeNode> {
    const { accountId } = kit.config

    const action: GetThemeAction = { type: 'get-theme', accountId }
    const response = kit.gateway.fetch(actionRequestX(action, GetThemeEndpoint))
    const { theme, error } = await getResult<GetThemeResult>(response)

    if (theme) return theme
    throw new CLIError('Failed to load Theme', error.message)
}

async function getThemeFromFile(themePath: string): Promise<ThemeNode> {
    const text = await readFile(path.join(process.cwd(), themePath), { encoding: 'utf8' })
    return JSON.parse(text)
}

async function saveThemeToFile(theme: ThemeNode) {
    const data = JSON.stringify(theme)
    const checksum = crypto.createHash('sha256').update(data).digest('hex')

    await writeFile(path.join(process.cwd(), `theme-${new Date().toISOString()}.json`), data)
    return checksum
}

async function deleteThemeFromServer(kit: CliKit, themeChecksum: string): Promise<void> {
    const { accountId } = kit.config

    const action: ResetThemeAction = { type: 'reset-theme', accountId, themeChecksum }
    const response = kit.gateway.fetch(actionRequestX(action, ResetThemeEndpoint))
    const { error } = await getResult<ResetThemeResult>(response)

    if (error) throw new CLIError('Failed to reset Theme', error.message)
}
