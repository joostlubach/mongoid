import { pluralize } from 'inflected'
import { snakeCase } from 'lodash'
import { mergeSchema, ObjectSchema, schemaKeys, Type } from 'validator'
import { object, string } from 'validator/types'

import Model from './Model'
import config from './config'
import { isVirtual } from './types'
import { ID, ModelClass, ModelConfig } from './typings'

export default class Meta<M extends Model> {

  constructor(
    public readonly Model:  ModelClass<M>,
    public readonly config: ModelConfig,
  ) {}

  // #region Basic info

  public get modelName() {
    return this.config.name
  }

  public get collectionName(): string {
    if (this.config.collectionName != null) {
      return this.config.collectionName
    } else {
      return snakeCase(pluralize(this.modelName))
    }
  }

  // #endregion

  // #region IDs

  public idToMongo(id: ID): ID {
    if (this.config.idAdapter != null) {
      return this.config.idAdapter.toMongo(id)
    } else if (config.idAdapter != null) {
      return config.idAdapter.toMongo(id)
    } else {
      return id
    }
  }

  public idFromMongo(mongoID: ID): ID {
    if (this.config.idAdapter != null) {
      return this.config.idAdapter.fromMongo(mongoID)
    } else if (config.idAdapter != null) {
      return config.idAdapter.fromMongo(mongoID)
    } else {
      return mongoID
    }
  }

  public async generateID(model: Model): Promise<ID> {
    if (this.config.idGenerator != null) {
      return await this.config.idGenerator(model)
    } else {
      return config.idGenerator(model)
    }
  }

  // #endregion

  // #region Schemas

  public get schemas(): ObjectSchema[] {
    if (this.config.polymorphic) {
      return Object.values(this.config.schemas)
    } else {
      return [this.config.schema]
    }
  }

  public schemaForModel(model: Model): ObjectSchema {
    if (this.config.polymorphic) {
      const type = (model as any).type
      if (type == null) { return {} }

      const schema = this.config.schemas[type]
      if (schema == null) {
        throw new ReferenceError(`No schema found for polymorphic type ${model.constructor.name}.${type}`)
      }
      return schema
    } else {
      return this.config.schema ?? {}
    }
  }

  public get modelType(): Type<any, any> {
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

  // #endregion

  // #region Attributes

  public get mergedSchema(): ObjectSchema {
    const merged: ObjectSchema = {}

    if (this.config.polymorphic) {
      merged.type = string({
        required: true,
        enum:     Object.keys(this.config.schemas),
      })
    }

    for (const schema of this.schemas) {
      mergeSchema(merged, schema)
    }
    return merged
  }

  public findAttribute(model: Model, path: string): Type<any, any> | null {
    let found: Type<any, any> | null = null
    this.modelType.traverse?.(model, [], (_, p, type) => {
      if (p === path) {
        found = type
        return false
      }
    })

    return found
  }

  public attributesForModel<M extends Model>(model: M, includeVirtual = false): Partial<M> {
    const attributes: any = {}
    const schema = this.schemaForModel(model)

    // Add the polymorphic type key
    if (this.config.polymorphic) {
      attributes.type = (model as any).type
    }

    // Add timestamps.
    if (includeVirtual) {
      attributes.createdAt = model.createdAt
      attributes.updatedAt = model.updatedAt
    }

    // Add all other attributes. Coerce to `null` if necessary.
    for (const name of schemaKeys(schema)) {
      if (!includeVirtual && isVirtual(schema[name])) {
        continue
      }

      attributes[name] = (model as any)[name]
      if (attributes[name] === undefined) {
        attributes[name] = null
      }
    }

    return attributes
  }

  // #endregion

}
