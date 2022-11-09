/* eslint-disable no-console */

import { IDGenerator } from './typings'
import { isFunction } from 'lodash'
import { ObjectId } from 'mongodb'

export interface Config {
  /** A function that generates an ID for the model when it is created. */
  idGenerator: IDGenerator

  /** Whether to manage timestamp fields `createdAt` and `updatedAt`. */
  timestamps: boolean

  /** A logger to use. */
  logger: Logger

  /** Whether to log (level=debug) all queries and pipelines. */
  traceEnabled: boolean

  /** If set to true, all MongoErrors will receive client stack traces. */
  clientStackTraces: boolean
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config = {
  idGenerator: () => new ObjectId(),
  timestamps:  true,

  logger: {
    debug: console.log,
    info:  console.log,
    warn:  console.warn,
    error: console.error,
  },

  traceEnabled:      false,
  clientStackTraces: process.env.NODE_ENV !== 'production',
}
export default config

export function configure(cfg: Partial<Config> | ((config: Config) => void)) {
  if (isFunction(cfg)) {
    cfg(config)
  } else {
    Object.assign(config, cfg)
  }
}