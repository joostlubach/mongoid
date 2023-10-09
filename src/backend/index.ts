export { connect } from './client'
export { default as config, type Config, configure } from '../config'
export { hook, registerHook, getHooks } from '../hooks'

export { default as ModelBackend } from './ModelBackend'
export { default as Aggregation } from './Aggregation'
export { default as QueryExecutor } from './QueryExecutor'
export { default as Cursor } from './Cursor'
export { default as Meta } from '../Meta'
export { default as ReferentialIntegrity, ReferentialIntegrityError, type Reference } from './ReferentialIntegrity'

export * from './createIndex'
export { type MongoClient } from 'mongodb'