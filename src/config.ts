/* eslint-disable no-console */

import { isFunction } from 'lodash'
import { ObjectId } from 'mongodb'
import { IDGenerator } from './typings'

export interface Config {
  /** A function that generates an ID for the model when it is created. */
  idGenerator: IDGenerator

  /** Whether to manage timestamp fields `createdAt` and `updatedAt`. */
  timestamps: boolean

  /** Whether ModelRetainer enables caching by default. Turn off for unit testing. */
  cachingEnabled: boolean

  /** A logger to use. */
  logger: Logger

  /** Whether to log (level=debug) all queries and pipelines. */
  traceEnabled: boolean

  /** If set to true, all MongoErrors will receive client stack traces. */
  clientStackTraces: boolean

  /** Whether caching is enabled in ModelRetainer. */
  cachingEnabled: boolean
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config = {
  idGenerator:    () => new ObjectId(),
  timestamps:     true,
  cachingEnabled: true,

  logger: {
    debug: console.log,
    info:  console.log,
    warn:  console.warn,
    error: console.error,
  },

  traceEnabled:      false,
  clientStackTraces: process.env.NODE_ENV !== 'production',
  cachingEnabled:    true,
}
export default config

export function configure(cfg: Partial<Config> | ((config: Config) => void)) {
  if (isFunction(cfg)) {
    cfg(config)
  } else {
    Object.assign(config, cfg)
  }
}