import Model from '../Model'
import Query from '../Query'
import { ObjectSchema, ObjectSchemaMap } from 'validator'
import { ObjectId, CreateIndexesOptions, Long } from 'mongodb'
import AggregationPipeline from '../AggregationPipeline'

//------
// Model options

export interface ConfigCommon {
  name: string

  collectionName?: string
  escapeKeys?:     boolean

  idGenerator: IDGenerator
  idAdapter:   IDAdapter<any> | null
  indexes:     Index[]
  transient:   string[]

  views:       Record<string, ViewFunction<any>>
  unique:      UniqueMap
}

export type Index = SimpleIndex | IndexWithOptions
export type DynamicIndex<M extends Model> = (model: M) => Promise<Primitive>
export type ViewFunction<M extends Model> = (pipeline: AggregationPipeline<M>) => void

export type SimpleIndex      = Record<string, number | 'text'>
export type IndexWithOptions = [SimpleIndex, CreateIndexesOptions]

export type UniqueMap  = Record<string, boolean | UniqueSpec>
export interface UniqueSpec {
  scope?: string[]
  query?: (query: Query<any>, subject: any) => Query<any>
  if?:    (subject: any) => boolean
}

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

export interface ModelClass<M extends Model> extends Omit<typeof Model, 'new' | 'prototype'> {
  new (attributes?: AnyObject): M
  prototype: M
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type IDOf<M extends Model> = ID

/**
 * Allowed ID types. Any other type is ok, if there's a custom ID adapter for the model.
 */
export type ID = ObjectId | Long | string | number

export type IDGenerator<I extends ID = any> = (model: Model) => I | Promise<I>

export interface IDAdapter<I extends ID> {
  toMongo:   (id: I) => ID
  fromMongo: (id: ID) => I
}

export interface SaveOptions {
  validate?: boolean
}