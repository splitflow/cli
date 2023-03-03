
import { createStyle } from '@splitflow/designer/style'

export const style = createStyle('component', {
    "root": {
        "padding": {
            "top": 0
        },
        ":hover": {
            "padding": {
                "top": 5
            }
        },
        "@:hover": {
            "padding": {
                "top": 10
            }
        }
    }
})
