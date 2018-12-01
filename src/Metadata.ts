import Model from './Model'
import db from './client'
import {ObjectID, Collection} from 'mongodb'
import {ModelConfig, ModelClass, ID, IDGenerator, Index} from './typings'
import {object} from '@joostlubach/validator/types'
import {isVirtual} from './types/virtual'
import {Type, ObjectSchema} from '@joostlubach/validator'
import {snakeCase, isArray} from 'lodash'
import {pluralize} from 'inflected'
import config from './config'

export default class Metadata<M extends Model> {

  //------
  // Construction

  constructor(Model: ModelClass<M>) {
    this.config = deriveConfig(Model)
  }

  config: ModelConfig

  //------
  // Db

  get collectionName(): string {
    return snakeCase(pluralize(this.config.name))
  }

  get collection(): Collection {
    return db().collection(this.collectionName)
  }

  get indexes(): Index[] {
    return this.config.indexes
  }

  async createIndexes() {
    for (const index of this.indexes) {
      const [keys, options] = isArray(index)
        ? index
        : [index, {}]

      const name = indexName(keys, options)
      if (!options.name) { options.name = name }

      try {
        await this.collection.createIndex(keys, options)
      } catch (error) {
        if (error.codeName === 'IndexOptionsConflict') {
          // This we can solve by dropping & recreating the index.
          await this.collection.dropIndex(name)
          await this.collection.createIndex(keys, options)
        } else {
          throw error
        }
      }
    }
  }

  //------
  // Schema

  get ids(): IDGenerator | null {
    return this.config.ids || config.ids
  }

  generateID(model: Model): ID {
    if (this.ids != null) {
      return this.ids(model)
    } else {
      return new ObjectID()
    }
  }

  get modelType(): Type<any> {
    if (this.config.polymorphic) {
      return object({
        required:    false,
        polymorphic: true,
        schemas:     this.config.schemas
      })
    } else {
      return object({
        required: false,
        schema:   this.config.schema
      })
    }
  }

  getSchema(model: Model): ObjectSchema {
    if (this.config.polymorphic) {
      const type = (model as any).type
      if (type == null) { return {} }

      const schema = this.config.schemas[type]
      if (schema == null) {
        throw new ReferenceError(`No schema found for polymorphic type ${model.constructor.name}.${type}`)
      }
      return schema
    } else {
      return this.config.schema || {}
    }
  }

  getAttributes<M extends Model>(model: M, includeVirtual: boolean = false): Partial<M> {
    const attributes: any = {}
    const schema = this.getSchema(model)

    // Add the polymorphic type key
    if (this.config.polymorphic) {
      attributes.type = (model as any).type
    }

    // Add timestamps.
    if (includeVirtual) {
      attributes.createdAt = model.createdAt
      attributes.updatedAt = model.updatedAt
    }

    // Add all other attributes.
    for (const name of Object.keys(schema)) {
      if (!includeVirtual && isVirtual(schema[name])) {
        continue
      }

      attributes[name] = (model as any)[name]
    }

    return attributes
  }

  serialize(model: M, includeVirtual: boolean): Record<keyof M, any> {
    const attributes = this.getAttributes(model, includeVirtual)
    const serialized = this.modelType.serialize(attributes)

    if (includeVirtual) {
      serialized.id = model.id
      serialized.createdAt = model.createdAt
      serialized.updatedAt = model.updatedAt
    }

    return serialized
  }

}

const defaultConfig = {
  ids:     config.ids,
  indexes: [],
  unique:  {}
}

function deriveConfig(Model: ModelClass<any>): ModelConfig {
  const {schema, schemas, ids, indexes, unique} = Model as any

  const config: AnyObject = {
    ...defaultConfig,
    name: Model.name
  }
  if (schemas != null) {
    config.polymorphic = true
    config.schemas = schemas
  } else {
    config.schema = schema
  }
  if (ids != null) {
    config.ids = ids
  }
  if (indexes != null) {
    config.indexes = indexes
  }
  if (unique != null) {
    config.unique = unique
  }

  return config as ModelConfig
}

function indexName(keys: {[key: string]: number | 'text'}, options: {name?: string}) {
  if (options.name) { return options.name }
  if (Object.values(keys).includes('text')) { return 'text' }

  return Object.keys(keys).map(key => `${key}_${keys[key]}`).join('_')
}