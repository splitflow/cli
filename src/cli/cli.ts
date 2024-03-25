import { Gateway, createGateway } from '@splitflow/app'
import { readFileSync } from 'fs'
import os from 'os'
import path from 'path'

export interface CliConfig {
    accountId?: string
    appId?: string
}

export interface CliKit {
    config: CliConfig
    gateway: Gateway
}

export interface UserConfig {
    refreshToken: string
}

export function createCliKit(config: CliConfig): CliKit {
    const userConfig: UserConfig = JSON.parse(readFileSync(userConfigFilePath(), 'utf8'))

    const gateway = createGateway({ refreshToken: userConfig?.refreshToken })
    return { config, gateway }
}

export function userConfigFilePath() {
    return path.join(os.homedir(), '.splitflow', 'config.json')
}
