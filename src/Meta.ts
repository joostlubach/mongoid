import { pluralize } from 'inflected'
import { snakeCase } from 'lodash'
import { ObjectId } from 'mongodb'
import { ObjectSchema, Type } from 'validator'
import { object } from 'validator/types'
import Model from './Model'
import { isVirtual } from './types/virtual'
import { ID, Index, ModelClass, ModelConfig } from './typings'

export default class Meta<M extends Model> {

  //------
  // Construction

  constructor(
    public readonly Model: ModelClass<M>,
    public readonly config: ModelConfig,
  ) {}

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
      ...this.config.indexes ?? [],
      {'_references.model': 1, '_references.id': 1},
    ]
  }

  //------
  // Schema

  public async generateID(model: Model): Promise<ID> {
    if (this.config.idGenerator != null) {
      return await this.config.idGenerator(model)
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

  public findSchemaType(model: Model, path: string): Type<any, any> | null {
    let found: Type<any, any> | null = null
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

}