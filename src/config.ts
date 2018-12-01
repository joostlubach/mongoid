import {IDGenerator} from './typings'
import {isFunction} from 'lodash'

export type Config = {
  /** A function that generates an ID for the model when it is created. */
  ids: IDGenerator | null

  /** Whether to manage timestamp fields `createdAt` and `updatedAt`. */
  timestamps: boolean

  logger: {
    debug: (message: string, ...meta: any[]) => void
    info:  (message: string, ...meta: any[]) => void
    warn:  (message: string, ...meta: any[]) => void
    error: (message: string, ...meta: any[]) => void
  }
}

const config: Config = {
  ids:        null,
  timestamps: true,

  logger: {
    debug: console.log,
    info:  console.log,
    warn:  console.warn,
    error: console.error
  }
}
export default config

export function configure(cfg: Partial<Config> | ((config: Config) => void)) {
  if (isFunction(cfg)) {
    cfg(config)
  } else {
    Object.assign(config, cfg)
  }
}