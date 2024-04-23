export {
  MongoClient,
  Db,
  Collection,
  ObjectId,
  type CountOptions,
  type Document,
  FindCursor as mongodb_FindCursor,
  AggregationCursor as mongodb_AggregationCursor,
} from 'mongodb'

export { default as FilterMatcher } from './FilterMatcher'
export { default as InconsistencyError } from './InconsistencyError'
export { default as InvalidModelError } from './InvalidModelError'
export { default as Model, type SerializeOptions, SerializeTarget } from './Model'
export { default as ModelChange, ModelChangeType, type Modifications, UNKNOWN } from './ModelChange'
export { type AsQuery, default as Query, type QueryRaw, Scope } from './Query'
export { type Config, configure } from './config'
export { PolymorphicRef } from './types'
export { Ref } from './types/ref'

export * from './aggregation'
export * from './registry'
export * from './hooks'
export * from './util'
export * from './typings'