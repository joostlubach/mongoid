import { cloneDeep, isEqual, some } from 'lodash'
import { DateTime } from 'luxon'
import { INVALID, schemaKeys, Validator } from 'validator'
import { emptyObject, objectEntries, objectKeys } from 'ytil'

import Meta from './Meta.js'
import Query, { Scope } from './Query.js'
import { getModelMeta } from './registry.js'
import { isVirtual } from './types/index.js'
import { ID, ModelClass, ModelRaw } from './typings.js'

export default class Model {

  // ------
  // Constructor & properties

  constructor(attributes: Record<string, any> = {}) {
    const {id, ...rest} = attributes
    const coerced = this.coerce(rest, false)
    Object.defineProperty(this, 'originals', {value: emptyObject(), writable: true, enumerable: false})
    Object.defineProperty(this, 'persisted', {value: false, writable: true, enumerable: false})
    Object.assign(this, {id, ...coerced})
  }

  public id: ID = null!

  public originals: Record<string, any> = {}

  public createdAt: DateTime | null = null
  public updatedAt: DateTime | null = null

  /**
   * Whether this model has not yet been saved to the database.
   */
  private persisted: boolean = false
  public get isPersisted() {
    return this.persisted
  }

  // #region Meta

  public get ModelClass() {
    return this.constructor as ModelClass<this>
  }

  public static get meta(): Meta<any> {
    return getModelMeta(this)
  }

  public get meta() {
    return getModelMeta(this.ModelClass)
  }

  public static get modelName() {
    return this.meta.modelName
  }

  public get modelName() {
    return this.ModelClass.modelName
  }

  public get schema() {
    return this.meta.schemaForModel(this)
  }

  // #endregion

  // #region ID

  public async ensureID(): Promise<ID> {
    if (this.id == null) {
      this.id = await this.meta.generateID(this)
    }

    return this.id
  }

  public get mongoID(): ID {
    return this.meta.idToMongo(this.id)!
  }

  // #endregion

  // #region Attributes

  /**
   * Gets all attributes that are defined in the schema.
   */
  public get attributes(): Record<string, any> {
    return this.meta.attributesForModel(this)
  }

  public get(attribute: string) {
    return (this as any)[attribute]
  }

  /**
   * Casts given attributes to the types specified in this model's schema. This is done automatically
   * in the {@linkcode assign} function.
   */
  public coerce(raw: Record<string, any>, partial: boolean): Record<string, any> {
    const validator = new Validator()

    // For polymorphic models, the type property is important in determining the correct schema. If this
    // changes, we need to take special action.
    if (this.meta.config.polymorphic && 'type' in raw && raw.type !== (this as any).type) {
      // Make sure to assign it first if it's specified in the raw array. This will make sure that the
      // expression `this.meta.modelType` will result in the correct type.
      Object.assign(this, {type: raw.type})

      // Also, the entire validation structure changes for this model, so we need to do a full recoerce.
      raw = Object.assign({}, this.meta.attributesForModel(this, false), raw)
      partial = false
    }

    // Conversely, if the 'raw' object does not have a type property, make sure that it uses the current
    // type property.
    if (this.meta.config.polymorphic && raw.type == null) {
      raw.type = (this as any).type
    }

    const coerced = validator.coerce(raw, this.meta.modelType, partial)
    if (coerced === INVALID) { return {} }

    // Delete virtual properties.
    const schema = this.meta.schemaForModel(this)
    for (const name of schemaKeys(schema)) {
      if (isVirtual(schema[name])) {
        delete (coerced as any)[name]
      }
    }

    return coerced as Record<string, any>
  }

  /**
   * Casts the attributes in this model again. Happens automatically before saving.
   */
  public recoerce(): this {
    const attributes = this.meta.attributesForModel(this, false)
    Object.assign(this, this.coerce(attributes, false))
    return this
  }

  /**
   * Assigns attributes to this model.
   *
   * @param raw The attributes to assign.
   */
  public assign(raw: Record<string, any>) {
    const {id, ...rest} = this.coerce(raw, true)
    if (id !== undefined) {
      this.id = id
    }

    if (Object.keys(rest).length > 0) {
      Object.assign(this, rest)
    }
  }

  // #endregion

  // #region Serialization

  /**
   * Serializes this model for sending over JSON.
   */
  public serialize(includeVirtual: boolean = true): ModelRaw {
    const attributes = this.meta.attributesForModel(this, includeVirtual)
    const serialized = this.meta.modelType.serialize(attributes)

    if (includeVirtual) {
      serialized.id = this.id
      serialized.createdAt = this.createdAt
      serialized.updatedAt = this.updatedAt
    } else {
      // Delete all virtual attributes.
      const virtualKeys = objectEntries(this.schema)
        .filter(it => isVirtual(it[1]))
        .map(it => it[0])

      virtualKeys.forEach(key => {
        delete serialized[key]
      })
    }

    return serialized
  }

  /**
   * Deserializes this model from JSON. Similar to {@linkcode assign}, but also sets the ID and timestamps,
   * and marks the model as `clean` and `persisted`.
   *
   * @param attributes The attributes to hydrate with.
   */
  public async deserialize(raw: ModelRaw) {
    const {id, updatedAt, createdAt, ...rest} = raw

    const coerced = this.coerce(rest, false)
    if (Object.keys(coerced).length === 0) { return }

    Object.assign(this, coerced)

    this.originals = cloneDeep(this.attributes as Partial<this>)
    this.id = id!
    this.updatedAt = updatedAt instanceof DateTime ? updatedAt : DateTime.fromJSDate(updatedAt)
    this.createdAt = createdAt instanceof DateTime ? createdAt : DateTime.fromJSDate(createdAt)
    this.markPersisted()
  }

  /**
   * Creates a new model by hydration from the database.
   *
   * @param attributes The attributes to hydrate with.
   */
  public static async deserialize<M extends Model>(this: ModelClass<M>, raw: ModelRaw): Promise<M> {
    const model = new this()
    await model.deserialize(raw)
    return model
  }

  /**
   * Checks whether this model (or any specific attribute) has changed with respect to the latest loaded
   * state from the database.
   *
   * @param attribute An attribute to check or leave out to check the entire model.
   */
  public isModified(attribute?: string): boolean {
    if (objectKeys(this.originals).length === 0) { return true }

    if (attribute === undefined) {
      const attributes = Object.keys(this.schema)
      return some(attributes, attribute => this.isModified(attribute))
    }

    const type = this.schema[attribute as any]
    if (type == null || isVirtual(type)) { return false }

    if (this.attributes[attribute] == null) {
      return this.originals[attribute] != null
    } else if (this.originals[attribute] == null) {
      return this.attributes[attribute] != null
    } else {
      return !isEqual(this.attributes[attribute], this.originals[attribute])
    }
  }

  public markPersisted() {
    this.persisted = true
  }

  public markDeleted() {
    this.persisted = false
  }

  public getDiff<M extends Model>() {
    const attributes: Partial<M> = {}

    for (const attr of Object.keys(this.schema)) {
      if (!this.isModified(attr)) { continue }
      (attributes as any)[attr] = this.get(attr)
    }

    return attributes
  }

  // #endregion

  // #region Querying & loading

  /**
   * Builds a query for this model.
   */
  public static query<M extends Model>(this: ModelClass<M>): Query<M> {
    return new Query(this)
  }

  public static scope<M extends Model>(this: ModelClass<M>, modifier: (query: Query<M>) => Query<M>) {
    return new Scope(this, modifier)
  }

  /**
   * Shortcut for `Model.query().filter({...})`.
   */
  public static filter<M extends Model>(this: ModelClass<M>, filters: Record<string, any>): Query<M> {
    return this.query().filter(filters)
  }

  // #endregion

}
