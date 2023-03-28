import { describe, expect, it } from 'vitest'
import { format } from '../../../src/cli/utils/json'

describe('json', () => {
    describe('format()', () => {
        it('with ast data', () => {
            const js =
                "{prop: \"value\", 'prop2': 1, prop3: ['value', 0], child: {\"child:prop\": 'value'}}"
            const json =
                '{"prop":"value","prop2":1,"prop3":["value",0],"child":{"child:prop":"value"}}'

            expect(format(js)).to.equal(json)
        })
        it('with line breaks', () => {
            const js = `{
                prop: "value"
            }`
            const json = '{"prop":"value"}'

            expect(format(js)).to.equal(json)
        })
    })
})
