
export function format(value: string) {
    if (value) {
        let result = ''

        for (const token of tokenize(value)) {
            if (SEPARATORS.indexOf(token) >= 0) {
                result += token
            } else if (token[0] == '"') {
                result += token
            } else if (token[0] >= '0' && token[0] <= '9') {
                result += token
            } else if (token[0] == "'") {
                result += '"' + token.slice(1, -1) + '"'
            } else {
                result += '"' + token + '"'
            }
        }
        return result
    }
    return value
}

const SEPARATORS = '{}[]:,'

export function* tokenize(value: string) {
    if (value) {
        let token = ''
        let escape = false

        for (const char of value) {
            if (char === ' ' || char == '\n') {
                continue
            }
            if (!escape && SEPARATORS.indexOf(char) >= 0) {
                yield token
                yield char
                token = ''
                continue
            }

            if (char === '"' || char === '\'') {
                escape = !escape
            }

            token += char
        }
    }
}
