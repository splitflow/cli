import { ThemeNode, ThemeDataNode } from '@splitflow/lib/style'
import { merge } from '@splitflow/core/utils'
import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'
import { CLIError } from './error'

const THEME_ENDPOINT = 'https://main.splitflow.workers.dev/theme'

const FILE_SCANNER = new FileScanner({
    filter: (fileName) => fileName.match(/^([^\.]*)\.sft\.(ts|js)$/)?.[1]
})

export interface ThemeOptions {
    projectId?: string
    theme?: string
    clear?: boolean
}

export default async function theme(options: ThemeOptions) {
    const [theme, mapping] = await Promise.all([
        options.theme ? getThemeFromFile(options.theme) : getThemeFromServer(options.projectId!),
        FILE_SCANNER.scan()
    ])

    await Promise.all(
        (function* () {
            for (const [themeName, themeData] of Object.entries(theme)) {
                const filePath = mapping.get(themeName)
                if (filePath) {
                    yield mergeSFThemeFile(filePath, themeName, themeData)
                } else {
                    console.warn(`File ${themeName}.sft.(ts|js) is missing`)
                }
            }
        })()
    )

    if (options.clear && !options.theme) {
        await deleteThemeFromServer(options.projectId!, await saveThemeToFile(theme))
    }
}

async function mergeSFThemeFile(filePath: string, themeName: string, themeData: ThemeDataNode) {
    const oldThemeData = parseSFThemeFileTemplate(await readFile(filePath, { encoding: 'utf8' }))
    const newThemeData = merge(oldThemeData, themeData, { deleteNullProps: true })
    await writeFile(filePath, sfThemeFileTemplate(themeName, newThemeData))
}

const THEME_DATA_REGEX = /createTheme\([^,]+,([^)]+)\)/

function parseSFThemeFileTemplate(fileContent: string): ThemeDataNode {
    const match = fileContent.match(THEME_DATA_REGEX)
    if (match) return JSON.parse(format(match[1]))
    return {}
}

function sfThemeFileTemplate(themeName: string, themeData: ThemeDataNode) {
    return `
import { createTheme } from '@splitflow/designer'

export const theme = createTheme('${themeName}', ${JSON.stringify(themeData, null, 4)})
`
}

async function getThemeFromServer(projectId: string): Promise<ThemeNode> {
    const response = await fetch(path.join(THEME_ENDPOINT, projectId))
    if (response.status === 200) {
        return response.json()
    }
    if (response.status === 400) {
        throw new CLIError('Failed to load Theme', (await response.json()).error)
    }
    throw new Error(response.statusText)
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

async function deleteThemeFromServer(projectId: string, checksum: string): Promise<void> {
    const response = await fetch(path.join(THEME_ENDPOINT, projectId), {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ checksum })
    })

    if (response.status === 200) return
    if (response.status === 400) {
        throw new CLIError('Failed to clear Theme', (await response.json()).error)
    }
    throw new Error(response.statusText)
}
