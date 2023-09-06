import { cloneDeep, isEqual, some } from 'lodash'
import Validator, { INVALID } from 'validator'
import Meta from './Meta'
import Query, { QueryOptions } from './Query'
import { getModelMeta } from './registry'
import { isVirtual } from './types/virtual'
import { ID, ModelClass } from './typings'
import { deepMapKeys } from './util'

export default class Model {

  //------
  // Constructor & properties

  constructor(attributes: Record<string, any> = {}) {
    const {id, ...rest} = attributes
    const coerced = this.coerce(rest, false)
    Object.defineProperty(this, 'originals', {value: null, writable: true, enumerable: false})
    Object.defineProperty(this, 'isNew', {value: true, writable: true, enumerable: false})
    Object.assign(this, {id, ...coerced})

    this.isNew = true
  }

  public id:        ID = null!

  public originals: Partial<this> | null = null

  public createdAt: Date | null = null
  public updatedAt: Date | null = null

  /**
   * Whether this model has not yet been saved to the database.
   */
  public isNew: boolean

  // #region Meta

  public get ModelClass() {
    return this.constructor as ModelClass<this>
  }

  public static get meta(): Meta<any> {
    return getModelMeta(this)
  }

  public get meta() {
    return this.ModelClass.meta
  }

  public static get modelName() {
    return this.meta.modelName
  }

  public get modelName() {
    return this.ModelClass.modelName
  }

  public get schema() {
    return this.meta.getSchema(this)
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
    return this.meta.getAttributes(this)
  }

  public get(attribute: string) {
    return (this as any)[attribute]
  }

  /**
   * Serializes this model for sending over JSON.
   */
  public serialize(): Record<keyof this, any> {
    return this.meta.serialize(this, true)
  }

  /**
   * Casts given attributes to the types specified in this model's schema. This is done automatically
   * in the {@link #assign} function.
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
      raw = Object.assign({}, this.meta.getAttributes(this, false), raw)
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
    const schema = this.meta.getSchema(this)
    for (const name of Object.keys(schema)) {
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
    const attributes = this.meta.getAttributes(this, false)
    Object.assign(this, this.coerce(attributes, false))
    return this
  }

  /**
   * Assigns attributes to this model.
   *
   * @param raw The attributes to assign.
   */
  public assign(raw: Record<string, any>) {
    const coerced = this.coerce(raw, true)
    Object.assign(this, coerced)
  }

  /**
   * Hydrates this model from the database.
   *
   * @param attributes The attributes to hydrate with.
   */
  public async hydrate(document: Record<string, any>) {
    const {_id, type, ...raw} = this.unescapeKeys(document)

    const id = this.meta.idFromMongo(_id)
    Object.assign(this, {id})

    const coerced = this.coerce({type, ...raw}, false)
    if (Object.keys(coerced).length === 0) { return }

    Object.assign(this, coerced)
    this.originals = cloneDeep(coerced) as Partial<this>

    this.isNew     = false
    this.updatedAt = raw.updatedAt
    this.createdAt = raw.createdAt
  }

  /**
   * Creates a new model by hydration from the database.
   *
   * @param attributes The attributes to hydrate with.
   */
  public static async hydrate<M extends Model>(this: ModelClass<M>, document: Record<string, any>): Promise<M> {
    const model = new this()
    await model.hydrate(document)
    return model
  }

  /**
   * Checks whether this model (or any specific attribute) has changed with respect to the latest loaded
   * state from the database.
   *
   * @param attribute An attribute to check or leave out to check the entire model.
   */
  public isModified(attribute?: keyof this): boolean {
    if (this.originals == null) { return true }

    if (attribute === undefined) {
      const attributes = Object.keys(this.schema)
      return some(attributes, attribute => this.isModified(attribute as keyof this))
    }

    const type = this.schema[attribute as any]
    if (type == null || isVirtual(type)) {
      return false
    }

    const originals = this.originals
    if (this[attribute] == null) {
      return originals[attribute] != null
    } else if (originals[attribute] == null) {
      return this[attribute] != null
    } else {
      return !isEqual(this[attribute], originals[attribute])
    }
  }

  public markClean() {
    this.originals = cloneDeep(this.attributes as Partial<this>)
  }

  public getDirtyAttributes() {
    return Object.keys(this.schema)
      .filter(attr => this.isModified(attr as any)) as Array<string>
  }

  private unescapeKeys(data: Record<string, any>) {
    if (!this.meta.config.escapeKeys) { return data }

    return deepMapKeys(data, key => {
      return key.toString()
        .replace(/\\u0024/g, '$')
        .replace(/\\u002e/g, '.')
        .replace(/\\\\/g, '\\')
    })
  }

  // #endregion

  //------
  // Querying & loading

  /**
   * Builds a query for this model.
   */
  public static query<M extends Model>(this: ModelClass<M>, options: QueryOptions = {}): Query<M> {
    return new Query(this, options)
  }

  /**
   * Shortcut for `Model.query().filter({...})`.
   */
  public static filter<M extends Model>(this: ModelClass<M>, filters: Record<string, any>): Query<M> {
    return this.query().filter(filters)
  }

}