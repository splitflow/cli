import { actionRequestX, getResult } from '@splitflow/lib'
import {
    AuthorizeDeviceAction,
    AuthorizeDeviceEndpoint,
    AuthorizeDeviceResult,
    GetAccessTokenAction,
    GetAccessTokenEndpoint,
    GetAccessTokenResult
} from '@splitflow/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import open from 'open'
import path from 'path'
import { CLIError } from './error'
import { UserConfig, userConfigFilePath } from './cli'

const CLI_CLIENT_ID = '1f16490f-b884-46eb-a9b5-ab93fe1349d0'

export interface SignInOptions {
    accountId?: string
}

export default async function signIn(options: SignInOptions) {
    const action: AuthorizeDeviceAction = {
        type: 'authorize-device',
        clientId: CLI_CLIENT_ID,
        accountId: options.accountId
    }
    const response = fetch(actionRequestX(action, AuthorizeDeviceEndpoint))
    const { deviceCode, verificationUriComplete, error } = await getResult<AuthorizeDeviceResult>(
        response
    )

    if (error) throw new CLIError('Failed to sign in', error.message)

    await open(verificationUriComplete)

    while (true) {
        sleep(5000)

        const action: GetAccessTokenAction = { type: 'get-access-token', deviceCode }
        const response = fetch(actionRequestX(action, GetAccessTokenEndpoint))
        const { refreshToken, error } = await getResult<GetAccessTokenResult>(response)

        if (error?.code === 'authorization-pending') {
            continue
        }

        if (refreshToken) {
            const userConfig: UserConfig = { refreshToken }

            await mkdir(path.dirname(userConfigFilePath()), { recursive: true })
            await writeFile(userConfigFilePath(), JSON.stringify(userConfig))
            break
        }
        throw new CLIError('Failed to sign in', error.message)
    }
}

const sleep = (waitTimeInMs: number) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs))
