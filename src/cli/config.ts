import { ConfigNode, ConfigurationNode, configToDef } from '@splitflow/lib/config'
import { merge } from '@splitflow/core/utils'
import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { FileScanner } from './utils/files'
import { format } from './utils/json'
import { CLIError } from './error'

const CONFIG_ENDPOINT = 'https://config.splitflow.workers.dev'

const FILE_SCANNER = new FileScanner({
    filter: (fileName) => fileName.match(/^([^\.]*)\.sfc\.(ts|js)$/)?.[1]
})

export interface ConfigOptions {
    appId?: string
    framework?: string
    configuration?: string
    clear?: boolean
}

export default async function config(options: ConfigOptions) {
    const [config, mapping] = await Promise.all([
        options.configuration
            ? getConfigFromFile(options.configuration)
            : getConfigFromServer(options.appId!),
        FILE_SCANNER.scan()
    ])

    await Promise.all(
        (function* () {
            for (const [componentName, configuration] of configToDef(config)) {
                const filePath = mapping.get(componentName)
                if (filePath) {
                    yield mergeSFConfigurationFile(
                        filePath,
                        componentName,
                        configuration,
                        template(options.framework)
                    )
                } else {
                    console.warn(`File ${componentName}.sfc.(ts|js) is missing`)
                }
            }
        })()
    )

    if (options.clear && !options.configuration) {
        await deleteConfigFromServer(options.appId!, await saveConfigToFile(config))
    }
}

async function mergeSFConfigurationFile(
    filePath: string,
    componentName: string,
    configuration: ConfigurationNode,
    template: (componentName: string, configuration: ConfigurationNode) => string
) {
    const oldConfiguration = parseSFConfigFileTemplate(
        await readFile(filePath, { encoding: 'utf8' })
    )
    const newConfiguration = merge(oldConfiguration, configuration, { deleteNullProps: true })
    await writeFile(filePath, template(componentName, newConfiguration))
}

const CONFIGURATION_REGEX = /createConfig\([^,]+,([^)]+)\)/

function parseSFConfigFileTemplate(fileContent: string): ConfigurationNode {
    const match = fileContent.match(CONFIGURATION_REGEX)
    if (match) return JSON.parse(format(match[1]))
    return {}
}

function template(framework: string) {
    switch (framework) {
        case 'svelte':
            return sfSvelteConfigFileTemplate
        default:
            return sfJavascriptConfigFileTemplate
    }
}

function sfJavascriptConfigFileTemplate(componentName: string, configuration: ConfigurationNode) {
    return `
import { createConfig } from '@splitflow/designer'

export const config = createConfig('${componentName}', ${JSON.stringify(configuration, null, 4)})
`
}

function sfSvelteConfigFileTemplate(componentName: string, configuration: ConfigurationNode) {
    return `
import { createConfig as _createConfig } from '@splitflow/designer'
import { createConfig as __createConfig } from '@splitflow/designer/svelte'

export function createConfig() {
    return __createConfig(style)
}

export const config = _createConfig('${componentName}', ${JSON.stringify(configuration, null, 4)})
`
}

async function getConfigFromServer(appId: string): Promise<ConfigNode> {
    const response = await fetch(path.join(CONFIG_ENDPOINT, appId))
    if (response.status === 200) {
        return response.json()
    }
    if (response.status === 400) {
        throw new CLIError('Failed to load Config', (await response.json()).error)
    }
    throw new Error(response.statusText)
}

async function getConfigFromFile(configPath: string): Promise<ConfigNode> {
    const text = await readFile(path.join(process.cwd(), configPath), { encoding: 'utf8' })
    return JSON.parse(text)
}

async function saveConfigToFile(config: ConfigNode) {
    const data = JSON.stringify(config)
    const checksum = crypto.createHash('sha256').update(data).digest('hex')

    await writeFile(path.join(process.cwd(), `config-${new Date().toISOString()}.json`), data)
    return checksum
}

async function deleteConfigFromServer(appId: string, checksum: string): Promise<void> {
    const response = await fetch(path.join(CONFIG_ENDPOINT, appId), {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ checksum })
    })

    if (response.status === 200) return
    if (response.status === 400) {
        throw new CLIError('Failed to clear Config', (await response.json()).error)
    }
    throw new Error(response.statusText)
}
