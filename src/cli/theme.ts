import { RootNode, ThemeDataNode } from '@splitflow/core/theme'
import { merge } from '@splitflow/core/utils/object'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'

const THEME_ENDPOINT = 'https://main.splitflow.workers.dev/theme'

export interface ThemeOptions {
    projectId?: string
    theme?: string
}

export default async function theme(options: ThemeOptions) {
    const fileScanner = new FileScanner({
        filter: (fileName) => fileName.match(/^([^\.]*)\.sft\.(ts|js)$/)?.[1]
    })

    const [theme, mapping] = await Promise.all([getTheme(options), fileScanner.scan()])

    const promises = []
    for (const [themeName, themeData] of Object.entries(theme)) {
        const filePath = mapping.get(themeName)
        if (filePath) {
            promises.push(mergeSFThemeFile(filePath, themeName, themeData))
        } else {
            console.warn(`File ${themeName}.sft.(ts|js) is missing`)
        }
    }

    await Promise.all(promises)
}

async function mergeSFThemeFile(filePath: string, themeName: string, themeData: ThemeDataNode) {
    const oldThemeData = parseSFThemeFileTemplate(await readFile(filePath, { encoding: 'utf8' }))
    await writeFile(filePath, sfThemeFileTemplate(themeName, merge(oldThemeData, themeData)))
}

const THEME_DATA_REGEX = /createTheme\([^,]+,([^)]+)\)/

function parseSFThemeFileTemplate(fileContent: string): ThemeDataNode {
    const match = fileContent.match(THEME_DATA_REGEX)
    if (match) return JSON.parse(format(match[1]))
    return {}
}

function sfThemeFileTemplate(themeName: string, themeData: ThemeDataNode) {
    return `
import { createTheme } from '@splitflow/designer/theme'

export const theme = createTheme('${themeName}', ${JSON.stringify(themeData, null, 4)})
`
}

function getTheme(options: ThemeOptions): Promise<RootNode> {
    if (options.theme) return getThemeFromFile(options.theme)
    return getThemeFromServer(options.projectId!)
}

async function getThemeFromServer(projectId: string): Promise<RootNode> {
    const response = await fetch(path.join(THEME_ENDPOINT, projectId))
    if (response.status === 200) {
        return response.json()
    }
    throw 'Failed to load Theme'
}

async function getThemeFromFile(themePath: string): Promise<RootNode> {
    const text = await readFile(path.join(process.cwd(), themePath), { encoding: 'utf8' })
    return JSON.parse(text)
}
