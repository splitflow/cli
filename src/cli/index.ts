#!/usr/bin/env node
import yargs from 'yargs/yargs'
import css from './css'
import { CLIError } from './error'
import style from './style'
import theme from './theme'

yargs(process.argv.slice(2))
    .config('config')
    .default('config', 'splitflow.config.json')
    .option('projectId', {
        alias: 'p',
        type: 'string',
        description: 'SplitFlow project ID'
    })
    .command(
        'css',
        'Generate the CSS file for your project',
        () => {},
        (argv) => css(argv.projectId as any)
    )
    .command(
        'style [ast]',
        'Generate SplitFlow style definitions',
        (yargs) =>
            yargs
                .positional('ast', {
                    type: 'string',
                    describe: 'Path to AST file'
                })
                .option('clear', {
                    alias: 'c',
                    type: 'boolean',
                    description: 'Clear AST definition from server'
                })
                .check((argv) => {
                    if (!argv.ast && !argv.projectId) {
                        throw new Error(
                            'If no AST file path is specified, the projectId option must be set'
                        )
                    }
                    return true
                }),
        (argv) => style(argv)
    )
    .command(
        'theme [theme]',
        'Generate SplitFlow themes',
        (yargs) =>
            yargs
                .positional('theme', {
                    type: 'string',
                    describe: 'Path to Theme file'
                })
                .option('clear', {
                    alias: 'c',
                    type: 'boolean',
                    description: 'Clear Theme data from server'
                })
                .check((argv) => {
                    if (!argv.theme && !argv.projectId) {
                        throw new Error(
                            'If no Theme file path is specified, the projectId option must be set'
                        )
                    }
                    return true
                }),
        (argv) => theme(argv)
    )
    .fail((_, error, yargs) => {
        console.error(yargs.help())
        console.error('')
        if (error instanceof CLIError) {
            console.error(`${error.snack}: ${error.message}`)
        } else {
            console.error(error.stack)
        }
        process.exit(1)
    }).argv
