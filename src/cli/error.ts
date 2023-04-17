export class CLIError extends Error {
    constructor(snack: string, message?: string) {
        super(message ?? snack)
        this.name = this.constructor.name
        this.snack = snack
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor)
        } else {
            this.stack = new Error(message).stack
        }
    }

    snack: string
}