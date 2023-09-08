import { ObjectSchema, ObjectSchemaMap } from 'validator'
import Meta from './Meta'
import Model from './Model'
import { ConfigCommon, ModelClass, ModelConfig } from './typings'

const REGISTRY: Array<[ModelClass<any>, Meta<any>]> = []

export function getModelClass(name: string): ModelClass<any> {
  const Model = REGISTRY.find(it => it[1].modelName === name)?.[0] ?? null
  if (Model == null) {
    throw new Error(`Model \`${name}\` is not registered as a model class`)
  }

  return Model
}

export function getModelMeta<M extends Model>(nameOrModelClass: string | ModelClass<M>): Meta<M> {
  const meta = REGISTRY.find(([Model, meta]) => {
    if (typeof nameOrModelClass === 'string') {
      return meta.modelName === nameOrModelClass
    } else {
      return Model === nameOrModelClass
    }
  })?.[1]

  if (meta == null) {
    if (typeof nameOrModelClass === 'string') {
      throw new Error(`Model \`${nameOrModelClass}\` is not registered as a model class`)
    } else {
      throw new Error(`Model class \`${nameOrModelClass.name}\` is not registered as a model class`)
    }
  }

  return meta
}

export function getAllModelClasses() {
  return REGISTRY.map(it => it[0])
}

export function model<M extends Model>(name: string, options: ModelOptions): ClassDecorator {
  return Class => {
    const ModelClass = Class as any as ModelClass<M>
    if (!(ModelClass.prototype instanceof Model)) {
      throw new Error(`Model class \`${Class.name}\` cannot be registered as a model class as it does not derive from Model`)
    }
    if (REGISTRY.some(it => it[0] === ModelClass)) {
      throw new Error(`Model \`${name}\` is already registered as a model class`)
    }

    const config = {
      name,
      polymorphic: 'schemas' in options,
      ...options
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
