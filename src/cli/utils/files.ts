import { readdir } from 'fs/promises'
import path from 'path'

export interface FileScannerOptions {
    include?: (dirName: string) => boolean
    filter: (fileName: string) => string | undefined
}

export class FileScanner {
    constructor({ include, filter }: FileScannerOptions) {
        this.include = (dirName) => dirName !== 'node_modules' && (include?.(dirName) ?? true)
        this.filter = filter
    }

    include: (dirName: string) => boolean
    filter: (fileName: string) => string | undefined

    async scan() {
        const result = new Map<string, string>()
        await this.scanDir(result, path.join(process.cwd()))
        return result
    }

    async scanDir(result: Map<string, string>, dirPath: string) {
        const entries = await readdir(dirPath, { withFileTypes: true })

        const promises: Promise<void>[] = []
        for (const entry of entries) {
            if (entry.isDirectory() && this.include(entry.name)) {
                promises.push(this.scanDir(result, path.join(dirPath, entry.name)))
            } else if (entry.isFile()) {
                const key = this.filter(entry.name)

                if (key) {
                    result.set(key, path.join(dirPath, entry.name))
                }
            }
        }

        await Promise.all(promises)
    }
}
