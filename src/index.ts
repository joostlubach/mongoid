export { Collection, type CountOptions, Db, type Document, MongoClient, ObjectId } from 'mongodb'

export { default as FilterMatcher } from './FilterMatcher'
export { default as InconsistencyError } from './InconsistencyError'
export { default as InvalidModelError } from './InvalidModelError'
export { default as Model } from './Model'
export {
  default as ModelChange,
  ModelChangeType,
  type Modifications,
  UNKNOWN,
} from './ModelChange'
export { type AsQuery, default as Query, type QueryRaw, Scope } from './Query'
export { type Config, configure } from './config'
export { PolymorphicRef } from './types'
export { Ref } from './types/ref'
