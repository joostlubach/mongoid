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
export {  Ref, type RefOptions  } from 'types/ref'
export {  PolymorphicRef  } from 'types/polymorphicRef'
export {  isVirtual  } from 'types/virtual'

export { type MongoClient } from 'mongodb'