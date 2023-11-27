import { DateTime } from 'luxon'
import { CreateIndexesOptions, Long, ObjectId } from 'mongodb'
import { MergedPolySchemaInstance, ObjectSchema, ObjectSchemaMap, SchemaInstance } from 'validator'
import AggregationPipeline from './aggregation/AggregationPipeline'
import Model from './Model'
import Query from './Query'

export type ModelConfig = MonoModelConfig<any> | PolyModelConfig<any>

export interface ConfigCommon {
  name: string

  collectionName?: string
  escapeKeys?:     boolean

  idGenerator?: IDGenerator
  idAdapter?:   IDAdapter<any> | null
  indexes?:     Index[]
  unique?:      UniqueMap
  transient?:   string[]
}

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

// ------
// Misc

export interface ModelClass<M extends Model> extends Omit<typeof Model, 'new' | 'meta' | 'prototype'> {
  new (attributes?: Record<string, any>): M
  prototype: M
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type IDOf<M extends Model> = ID

/**
 * Allowed ID types. Any other type is ok, if there's a custom ID adapter for the model.
 */
export type ID = ObjectId | Long | string | number

export const ID: {
  isID: (id: any) => id is ID
} = {
  isID: (id: any): id is ID => {
    if (typeof id === 'number') { return true }
    if (typeof id === 'string') { return true }
    if (ObjectId.isValid(id)) { return true }

    return false
  },
}

export type IDGenerator<I extends ID = any> = (model: Model) => I | Promise<I>

export interface IDAdapter<I extends ID> {
  toMongo:   (id: I) => ID
  fromMongo: (id: ID) => I
}

export interface ModelBackendOptions {
  collectionName?: string
  escapeKeys?:     boolean
  indexes?:        Index[]
}

export interface SaveOptions {
  validate?: boolean
  hooks?:    boolean
}

export type Filter = Record<string, any>
export type Sorts = Record<string, 1 | -1>

export type Index = SimpleIndex | IndexWithOptions
export type DynamicIndex<M extends Model> = (model: M) => Promise<Primitive>
export type ViewFunction<M extends Model> = (pipeline: AggregationPipeline<M>) => void
export type Primitive = string | number | boolean | null | undefined

export type SimpleIndex = Record<string, number | 'text' | undefined>
export type IndexWithOptions = [SimpleIndex, CreateIndexesOptions]

export type UniqueMap = Record<string, boolean | UniqueSpec>
export interface UniqueSpec {
  scope?: string[]
  query?: (query: Query<any>, subject: any) => Query<any>
  if?:    (subject: any) => boolean
}

export type MonomorphicModelClassOf<S extends ObjectSchema> = Omit<typeof Model, 'new'> & (new (attributes?: Record<string, any>) => Model & SchemaInstance<S>)
export type PolymorphicModelClassOf<SM extends ObjectSchemaMap> = Omit<typeof Model, 'new'> & (new (attributes?: Record<string, any>) => Model & MergedPolySchemaInstance<SM>)

export function TypedModel<S extends ObjectSchema>(schema: S): MonomorphicModelClassOf<S>
export function TypedModel<SM extends ObjectSchemaMap>(schemas: SM): PolymorphicModelClassOf<SM>
export function TypedModel() { return Model }

export type ModelRaw = Record<string, any> & {
  id:        ID | null
  createdAt: DateTime
  updatedAt: DateTime
}
