import { writeFile } from "fs/promises"
import path from "path"

const CSS_ENDPOINT = 'https://main.splitflow.workers.dev/css'

async function getCSS(key: string) {
    const response = await fetch(path.join(CSS_ENDPOINT, key))
    if (response.status === 200) {
        return response.text()
    }
    return null
}


export default async function css(projectId: string) {
    const css = await getCSS(projectId)

    if (css) {
        await writeFile('./app.css', css)
    }
}