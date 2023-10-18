#!/usr/bin/env node
import yargs from 'yargs/yargs'
import { CLIError } from './error'
import style from './style'
import theme from './theme'
import config from './config'

yargs(process.argv.slice(2))
    .config('config')
    .default('config', 'splitflow.config.json')
    .option('projectId', {
        alias: 'p',
        type: 'string',
        description: 'SplitFlow project ID'
    })
    .option('appId', {
        alias: 'a',
        type: 'string',
        description: 'SplitFlow application ID'
    })
    .option('framework', {
        alias: 'f',
        type: 'string',
        description: 'Targeted web Framework',
        choices: ['svelte']
    })
    .command(
        'style [style]',
        'Generate SplitFlow style definitions',
        (yargs) =>
            yargs
                .positional('ast', {
                    type: 'string',
                    describe: 'Path to style definitions file'
                })
                .option('clear', {
                    alias: 'c',
                    type: 'boolean',
                    description: 'Clear style definitions from server'
                })
                .check((argv) => {
                    if (!argv.ast && !argv.appId) {
                        throw new Error(
                            'If no style file path is specified, the appId option must be set'
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
                    describe: 'Path to theme file'
                })
                .option('clear', {
                    alias: 'c',
                    type: 'boolean',
                    description: 'Clear theme data from server'
                })
                .check((argv) => {
                    if (!argv.theme && !argv.projectId) {
                        throw new Error(
                            'If no theme file path is specified, the projectId option must be set'
                        )
                    }
                    return true
                }),
        (argv) => theme(argv)
    )
    .command(
        'configuration [configuration]',
        'Generate SplitFlow configuration definitions',
        (yargs) =>
            yargs
                .positional('configuration', {
                    type: 'string',
                    describe: 'Path to configuration definitions file'
                })
                .option('clear', {
                    alias: 'c',
                    type: 'boolean',
                    description: 'Clear configuration definitions from server'
                })
                .check((argv) => {
                    if (!argv.configuration && !argv.appId) {
                        throw new Error(
                            'If no configuration file path is specified, the appId option must be set'
                        )
                    }
                    return true
                }),
        (argv) => config(argv)
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
