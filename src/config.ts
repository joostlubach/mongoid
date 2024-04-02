/* eslint-disable no-console */

import { isFunction, merge } from 'lodash'
import { ConnectOptions, ObjectId } from 'mongodb'

import { ID, IDAdapter, IDGenerator } from './typings.js'

export interface Config<I extends ID> {
  connect?: ConnectOptions

  /** A function that generates an ID for the model when it is created. */
  idGenerator: IDGenerator<I>

  /** An ID adapter used to convert a custom ID type from and to mongo */
  idAdapter?: IDAdapter<I>

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
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config<any> = {
  connect:        {},
  idGenerator:    () => new ObjectId(),
  timestamps:     true,
  cachingEnabled: true,

  logger: {
    debug: process.env.DEBUG ? console.debug : () => {},
    info:  console.log,
    warn:  console.warn,
    error: console.error,
  },

  traceEnabled:      false,
  clientStackTraces: process.env.NODE_ENV !== 'production',
}
export default config

export function configure<I extends ID>(cfg: Partial<Config<I>> | ((config: Config<I>) => void)) {
  if (isFunction(cfg)) {
    cfg(config)
  } else {
    merge(config, cfg)
  }
}
