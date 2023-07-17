import { pluralize } from 'inflected'
import { isArray, snakeCase } from 'lodash'
import { Collection, ObjectId } from 'mongodb'
import { ObjectSchema, Type } from 'validator'
import { object } from 'validator/types'
import AggregationPipeline from './AggregationPipeline'
import db from './client'
import config from './config'
import Model from './Model'
import { isVirtual } from './types/virtual'
import { ID, Index, ModelClass, ModelConfig, ViewFunction } from './typings'

export default class Metadata<M extends Model> {

  //------
  // Construction

  constructor(Model: ModelClass<M>) {
    this.Model = Model
    this.config = deriveConfig(Model)
  }

  public readonly Model: ModelClass<M>
  public readonly config: ModelConfig

  //------
  // Db

  public get collectionName(): string {
    if (this.config.collectionName != null) {
      return this.config.collectionName
    } else {
      return snakeCase(pluralize(this.config.name))
    }
  }

  public get collection(): Collection {
    return db().collection(this.collectionName)
  }

  public idToMongo(id: ID): ID {
    if (id != null && this.config.idAdapter != null) {
      return this.config.idAdapter.toMongo(id)
    } else {
      return id
    }
  }

  public idFromMongo(mongoID: ID): ID {
    if (this.config.idAdapter != null) {
      return this.config.idAdapter.fromMongo(mongoID)
    } else {
      return mongoID
    }
  }

  public get indexes(): Index[] {
    return [
      ...this.config.indexes,
      {'_references.model': 1, '_references.id': 1},
    ]
  }

  public async createIndexes() {
    for (const index of this.indexes) {
      const [keys, options] = isArray(index)
        ? index
        : [index, {}]

      const name = indexName(keys, options)
      if (!options.name) { options.name = name }

      config.logger.debug(`Creating index: ${this.Model.name}.${name}`)

      try {
        await this.collection.createIndex(keys, options)
      } catch (error: any) {
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
  // Views

  public get views(): Record<string, ViewFunction<any>> {
    return {
      ...this.config.views,
    }
  }

  public async createViews() {
    for (const [name, fn] of Object.entries(this.views)) {
      config.logger.debug(`Creating view: ${this.Model.name}.${name}`)

      const pipeline = new AggregationPipeline(this.Model)
      fn(pipeline)

      // Make sure to drop it first.
      const existing = await db().listCollections({name}).toArray()
      if (existing.length > 0) {
        await db().collection(name).drop()
      }

      await db().createCollection(name, {
        viewOn:   this.collectionName,
        pipeline: pipeline.resolveStages(),
      })
    }
  }

  //------
  // Schema

  public generateID(model: Model): ID {
    if (this.config.idGenerator != null) {
      return this.config.idGenerator(model)
    } else {
      return new ObjectId()
    }
  }

  public getSchema(model: Model): ObjectSchema {
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

  public getSchemas(): ObjectSchema[] {
    if (this.config.polymorphic) {
      return Object.values(this.config.schemas)
    } else {
      return [this.config.schema]
    }
  }

  public get modelType(): Type<any> {
    if (this.config.polymorphic) {
      return object({
        required:    false,
        polymorphic: true,
        schemas:     this.config.schemas,
      })
    } else {
      return object({
        required: false,
        schema:   this.config.schema,
      })
    }
  }

  public findSchemaType(model: Model, path: string): Type<any> | null {
    let found: Type<any> | null = null
    this.modelType.traverse?.(model, [], (_, p, type) => {
      if (p === path) {
        found = type
        return false
      }
    })

    return found
  }

  public getAttributes<M extends Model>(model: M, includeVirtual = false): Partial<M> {
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

  public serialize(model: M, includeVirtual: boolean): Record<keyof M, any> {
    const attributes = this.getAttributes(model, includeVirtual)
    const serialized = this.modelType.serialize(attributes)

    if (includeVirtual) {
      serialized.id = model.id
      serialized.createdAt = model.createdAt
      serialized.updatedAt = model.updatedAt
    } else {
      // Delete all virtual attributes.
      for (const [name, type] of Object.entries(this.getSchema(model))) {
        if (isVirtual(type)) {
          delete serialized[name]
        }
      }
    }

    return serialized
  }

}

function deriveConfig(Model: ModelClass<any>): ModelConfig {
  const {
    collectionName,
    schema,
    schemas,
    escapeKeys,
    idGenerator,
    idAdapter,
    indexes,
    transient,
    views,
    unique,
  } = Model as any

  const modelConfig: Record<string, any> = {
    name:        Model.name,
    escapeKeys:  false,
    idGenerator: config.idGenerator,
    idAdapter:   null,
    indexes:     [],
    views:       {},
    transient:   [],
    unique:      {},
  }
  if (collectionName != null) {
    modelConfig.collectionName = collectionName
  }
  if (schemas != null) {
    modelConfig.polymorphic = true
    modelConfig.schemas = schemas
  } else {
    modelConfig.schema = schema
  }
  if (escapeKeys != null) {
    modelConfig.escapeKeys = escapeKeys
  }
  if (idGenerator != null) {
    modelConfig.idGenerator = idGenerator
  }
  if (idAdapter != null) {
    modelConfig.idAdapter = idAdapter
  }
  if (indexes != null) {
    modelConfig.indexes = indexes
  }
  if (transient != null) {
    modelConfig.transient = transient
  }
  if (views != null) {
    modelConfig.views = views
  }
  if (unique != null) {
    modelConfig.unique = unique
  }
  if (escapeKeys != null) {
    modelConfig.escapeKeys = escapeKeys
  }

  return modelConfig as ModelConfig
}

function indexName(keys: {[key: string]: number | 'text'}, options: {name?: string}) {
  if (options.name) { return options.name }
  if (Object.values(keys).includes('text')) { return 'text' }

  return Object.keys(keys).map(key => `${key}_${keys[key]}`).join('_')
}