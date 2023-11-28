import { ObjectSchema, ObjectSchemaMap } from 'validator'

import Meta from './Meta'
import mongoid_Model from './Model'
import { ConfigCommon, ModelClass, ModelConfig } from './typings'

const REGISTRY: Array<[ModelClass<any>, Meta<any>]> = []
const MODEL_META = new Meta(mongoid_Model, {
  name:        'Model',
  polymorphic: false,
  schema:      {},
})

export function getModelClass<M extends mongoid_Model>(name: string, throwIfNotFound: false): ModelClass<M> | null
export function getModelClass(name: 'Model'): ModelClass<mongoid_Model> | null
export function getModelClass<M extends mongoid_Model>(name: string, throwIfNotFound?: true): ModelClass<M>
export function getModelClass(name: string, throwIfNotFound: boolean = true) {
  if (name === 'Model') { return mongoid_Model }

  const Model = REGISTRY.find(it => it[1].modelName === name)?.[0] ?? null
  if (Model == null && throwIfNotFound) {
    throw new Error(`Model \`${name}\` is not registered as a model class`)
  }

  return Model
}

export function getModelClassForCollection(collectionName: string, throwIfNotFound: false): ModelClass<mongoid_Model> | null
export function getModelClassForCollection(collectionName: string, throwIfNotFound?: true): ModelClass<mongoid_Model>
export function getModelClassForCollection(collectionName: string, throwIfNotFound: boolean = true): ModelClass<any> | null {
  const Model = REGISTRY.find(it => it[1].collectionName === collectionName)?.[0] ?? null
  if (Model == null && throwIfNotFound) {
    throw new Error(`Model for collection \`${collectionName}\` is not registered as a model class`)
  }

  return Model
}

export function getModelMeta(nameOrModelClass: 'Model' | typeof mongoid_Model): Meta<mongoid_Model>
export function getModelMeta<M extends mongoid_Model>(nameOrModelClass: string | ModelClass<M>, throwIfNotFound: false): Meta<M> | null
export function getModelMeta<M extends mongoid_Model>(nameOrModelClass: string | ModelClass<M>, throwIfNotFound?: true): Meta<M>
export function getModelMeta(nameOrModelClass: string | ModelClass<any>, throwIfNotFound: boolean = true): Meta<any> | null {
  if (nameOrModelClass === 'Model' || nameOrModelClass === mongoid_Model) {
    return MODEL_META
  }

  const meta = REGISTRY.find(([Model, meta]) => {
    if (typeof nameOrModelClass === 'string') {
      return meta.modelName === nameOrModelClass
    } else {
      return Model === nameOrModelClass
    }
  })?.[1]

  if (meta == null && throwIfNotFound) {
    if (typeof nameOrModelClass === 'string') {
      throw new Error(`Model \`${nameOrModelClass}\` is not registered as a model class`)
    } else {
      throw new Error(`Model class \`${nameOrModelClass.name}\` is not registered as a model class`)
    }
  }

  return meta ?? null
}

export function getAllModelClasses() {
  return REGISTRY.map(it => it[0])
}

export function model<M extends mongoid_Model>(name: string, options: ModelOptions): ClassDecorator {
  return Class => {
    const ModelClass = Class as any as ModelClass<M>
    if (!(ModelClass.prototype instanceof mongoid_Model)) {
      throw new Error(`Model class \`${Class.name}\` cannot be registered as a model class as it does not derive from Model`)
    }
    if (REGISTRY.some(it => it[0] === ModelClass)) {
      throw new Error(`Model \`${name}\` is already registered as a model class`)
    }

    const config = {
      name,
      polymorphic: 'schemas' in options,
      ...options,
    } as ModelConfig

    const meta = new Meta(ModelClass, config)
    REGISTRY.push([ModelClass, meta])
  }
}

export type ModelOptions = MonoModelOptions<any> | PolyModelOptions<any>

/**
 * Monomorphic model: configure with a single schema.
 */
export type MonoModelOptions<S extends ObjectSchema> = Partial<Omit<ConfigCommon, 'name'>> & {
  schema: S
}

/**
 * Polymorphic model: configure with a polymorphic schema map.
 */
export type PolyModelOptions<SM extends ObjectSchemaMap> = Partial<Omit<ConfigCommon, 'name'>> & {
  schemas: SM
}
