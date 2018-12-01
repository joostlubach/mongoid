import Model from '../Model'
import Query from '../Query'
import {ObjectSchema, ObjectSchemaMap} from '@joostlubach/validator'
import {ObjectID, IndexOptions} from 'mongodb'

//------
// Model options

export interface ConfigCommon {
  name:    string
  ids:     IDGenerator | null
  indexes: Index[]
  unique:  UniqueMap
}

export type Index = SimpleIndex | IndexWithOptions

type SimpleIndex      = {[key: string]: number | 'text'}
type IndexWithOptions = [SimpleIndex, IndexOptions]

type UniqueMap = {[attribute: string]: UniqueSpec}
type UniqueSpec = boolean | string[] | ((query: Query<any>, subject: any) => Query<any>)

//------
// Model config

export type ModelConfig = MonoModelConfig<any> | PolyModelConfig<any>

/**
 * Monomorphic model: configure with a single schema.
 */
export type MonoModelConfig<S extends ObjectSchema> = ConfigCommon & {
  polymorphic: false
  schema:      S
}

/**
 * Polymorphic model: configure with a polymorphic schema map.
 */
export type PolyModelConfig<SM extends ObjectSchemaMap> = ConfigCommon & {
  polymorphic: true
  schemas:     SM
}

//------
// Misc

export type ModelClass<M extends Model> = typeof Model & (new (attributes: AnyObject) => M)

export type ID = ObjectID | string | number
export type IDGenerator = (model: Model) => ID

export interface SaveOptions {
  id?:       ID
  validate?: boolean
}