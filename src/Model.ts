import Metadata from './Metadata'
import Query from './Query'
import {emitChange} from './changes'
import Validator, {INVALID} from '@joostlubach/validator'
import {ValidationContext, ValidationResult, ObjectSchema} from '@joostlubach/validator'
import {DeleteWriteOpResultObject, UpdateWriteOpResult, Collection} from 'mongodb'
import {ID, SaveOptions, ModelClass} from './typings'
import InvalidModelError from './InvalidModelError'
import {some, cloneDeep, isEqual, isArray, isFunction} from 'lodash'
import {isVirtual} from './types/virtual'

export default class Model {

  //------
  // Constructor & properties

  constructor(attributes: AnyObject = {}) {
    const klass = this.constructor as typeof Model
    klass.initialize()

    Object.defineProperty(this, 'originals', {value: null, writable: true, enumerable: false})
    Object.assign(this, this.cast(attributes, false))
  }

  id:        ID | null = null

  originals: Partial<this> | null = null

  createdAt: Date | null = null
  updatedAt: Date | null = null

  /**
   * Whether this model has not yet been saved to the database.
   */
  get isNew(): boolean {
    return this.id == null
  }

  //------
  // Metadata

  static _meta: Metadata<any>

  static get meta(): Metadata<any> {
    this.initialize()
    return this._meta
  }

  static get collection(): Collection {
    return this.meta.collection
  }

  get meta(): Metadata<this> {
    const klass = this.constructor as typeof Model
    return klass.meta
  }

  get schema(): ObjectSchema {
    return this.meta.getSchema(this)
  }

  //------
  // Lifecycle

  /**
   * Initializes this model.
   */
  static async initialize(): Promise<void> {
    if (this._meta != null) { return }

    this._meta = new Metadata(this)
    this._meta.createIndexes()
  }

  //------
  // Attributes

  /**
   * Gets all attributes that are defined in the schema.
   */
  get attributes(): AnyObject {
    return this.meta.getAttributes(this)
  }

  get(attribute: string) {
    return (this as any)[attribute]
  }

  /**
   * Serializes this model for sending over JSON.
   */
  serialize(): Record<keyof this, any> {
    return this.meta.serialize(this, true)
  }

  /**
   * Casts given attributes to the types specified in this model's schema. This is done automatically
   * in the {@link #assign} function.
   */
  cast(raw: AnyObject, partial: boolean) {
    const validator = new Validator()

    if (this.meta.config.polymorphic && raw.type == null) {
      // Make sure to include the current type if not specified.
      raw = {...raw, type: this.attributes.type}
    }

    const cast = validator.cast(raw, this.meta.modelType, partial)
    if (cast === INVALID) { return cast }

    // Delete virtual properties.
    const schema = this.meta.getSchema(this)
    for (const name of Object.keys(schema)) {
      if (isVirtual(schema[name])) {
        delete (cast as any)[name]
      }
    }

    return cast
  }

  /**
   * Casts the attributes in this model again. Happens automatically before saving.
   */
  recast(): this {
    const attributes = this.meta.getAttributes(this, false)
    Object.assign(this, this.cast(attributes, false))
    return this
  }

  /**
   * Assigns attributes to this model.
   *
   * @param attributes The attributes to assign.
   */
  assign(raw: AnyObject) {
    const casted = this.cast(raw, true)
    if (casted === INVALID) { return }

    Object.assign(this, casted)
  }

  /**
   * Hydrates this model from the database.
   *
   * @param attributes The attributes to hydrate with.
   */
  async hydrate(document: AnyObject) {
    const {_id, ...raw} = document
    this.id = _id

    const casted = this.cast(raw, false)
    if (casted === INVALID) { return }

    Object.assign(this, casted)
    this.originals = cloneDeep(casted)

    this.updatedAt = raw.updatedAt
    this.createdAt = raw.createdAt
  }

  /**
   * Creates a new model by hydration from the database.
   *
   * @param attributes The attributes to hydrate with.
   */
  static async hydrate(document: AnyObject) {
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
  isDirty(attribute?: keyof this): boolean {
    if (this.originals == null) { return true }

    if (attribute === undefined) {
      const attributes = Object.keys(this.schema)
      return some(attributes, attribute => this.isDirty(attribute as keyof this))
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

  //------
  // Querying & loading

  /**
   * Builds a query for this model.
   */
  static query<M extends Model>(this: ModelClass<M>): Query<M> {
    return new Query(this)
  }

  /**
   * Counts the number of models of this type.
   *
   * @param query An optional query object.
   */
  static async count<M extends Model>(this: ModelClass<M>, query: Object = {}): Promise<number> {
    return await this.query().filter(query).count()
  }

  /**
   * Retrieves a model from the database by its ID.
   *
   * @param id The ID of the model to retrieve.
   */
  static async get<M extends Model>(this: ModelClass<M>, id: ID): Promise<M | null> {
    return await this.query().get(id)
  }

  /**
   * Shortcut for `Model.query().filter({...})`.
   */
  static filter<M extends Model>(this: ModelClass<M>, filters: AnyObject): Query<M> {
    return this.query().filter(filters)
  }

  /**
   * Retrieves the first model of this type in the database, satisfying some query.
   *
   * @param query The query object.
   */
  static async findOne<M extends Model>(this: ModelClass<M>, filters: AnyObject): Promise<M | null> {
    return await this.filter(filters).findOne()
  }

  /**
   * Builds a query by filtering  all models of this type with a simple query.
   *
   * @param query The query object.
   */
  static async find<M extends Model>(this: ModelClass<M>, filters: AnyObject): Promise<M[]> {
    return this.query().filter(filters).all()
  }

  /**
   * Retrieves the first model of this type.
   */
  static async first<M extends Model>(this: ModelClass<M>): Promise<M | null> {
    return await this.query().findOne()
  }

  /**
   * Retrieves the last model of this type.
   */
  static async last<M extends Model>(this: ModelClass<M>): Promise<M | null> {
    const count = await this.count()
    if (count === 0) { return null }

    const documents = await this.query().skip(count - 1).limit(1).all()
    return documents[0]
  }

  /**
   * Retrieves all models of this type.
   */
  static async all<M extends Model>(this: ModelClass<M>): Promise<M[]> {
    return await this.query().all()
  }

  /**
   * Reloads this model from the database. If the model has no ID, this does nothing.
   */
  async reload(): Promise<this> {
    const {id} = this
    if (id == null) { return this }

    const document = await this.meta.collection.findOne({_id: id})
    if (document == null) { return this }

    await this.hydrate(document)
    return this
  }

  /**
   * Finds or creates a model.
   *
   * @param required
   * 	 The attributes to filter by and the use when creating.
   * @param extra
   *   Extra arguments that are stored when the model is created. If the model already existed, these
   *   values are ignored.
   */
  static async ensure<M extends Model>(this: ModelClass<M>, required: AnyObject, extra: AnyObject = {}): Promise<M> {
    let model = await this.filter(required).findOne()
    if (model == null) {
      model = new this(required) as M
    } else if (Object.keys(extra).length === 0) {
      return model
    }

    await model.update(extra)
    return model
  }

  async update(attributes: AnyObject): Promise<this> {
    this.assign(attributes)
    return await this.save()
  }

  static async update(filter: AnyObject, updates: AnyObject): Promise<UpdateWriteOpResult> {
    return await this.query().filter(filter).update(updates)
  }

  //------
  // Deletion

  /**
   * Deletes all models of this type.
   */
  static async deleteAll(): Promise<DeleteWriteOpResultObject> {
    return await this.query().delete()
  }

  /**
   * Deletes this model.
   */
  async delete(): Promise<DeleteWriteOpResultObject> {
    return await (this.constructor as typeof Model).filter({id: this.id}).delete()
  }

  //------
  // Saving

  async save(options: SaveOptions = {}): Promise<this> {
    this.recast()

    if (options.validate !== false) {
      await this.validate(true)
    }

    const now = new Date()
    const document: AnyObject = {
      _id: options.id || this.id,
      ...this.meta.serialize(this, false) as any,
      updatedAt: now
    }
    if (this.isNew) {
      document.createdAt = now
    }

    if (document._id == null && this.meta.ids != null) {
      document._id = this.meta.ids(this)
    }
    if (document._id == null) {
      // We cannot leave the 'null'.
      delete document._id
    }

    await this.meta.collection.save(document)
    this.updatedAt = now
    if (this.isNew) {
      this.createdAt = now
    }

    this.id = document._id
    emitChange(this)

    // Update the originals so that the model is not seen as dirty anymore.
    this.originals = cloneDeep(this.attributes) as Partial<this>

    return this
  }

  //------
  // Validation

  /**
   * Validates this model.
   */
  async validate(throwIfInvalid: boolean = false): Promise<ValidationResult> {
    const validator = new Validator()
    const result = await validator.validate(
      this.attributes,
      this.meta.modelType,
      this.validateExtra.bind(this)
    )

    if (!result.valid && throwIfInvalid) {
      throw new InvalidModelError(this.constructor as ModelClass<this>, result)
    }

    return result
  }

  async validateExtra(context: ValidationContext) {
    for (const name of Object.keys(this.schema)) {
      const {unique} = this.schema[name].options
      if (!unique) { continue }

      await this.validateUnique(name as keyof this, unique, context)
    }
  }

  async validateUnique(attribute: keyof this, spec: boolean | (keyof this)[], context: ValidationContext) {
    if (!this.isDirty(attribute)) { return }

    const serialized  = this.serialize()
    const value = serialized[attribute]
    if (value == null) { return }

    let query = new Query(this.constructor as ModelClass<any>)
    query = query.filter({[attribute]: value})

    // Use a scope if required.
    if (isArray(spec)) {
      for (const attribute of spec) {
        query = query.filter({[attribute]: serialized[attribute]})
      }
    } else if (isFunction(spec)) {
      query = spec(query)
    }

    // Exclude this model instance.
    if (this.id != null) {
      query = query.filter({id: {$ne: this.id}})
    }

    const count = await query.count()
    if (count > 0) {
      context.for(attribute as string).addError('unique', "This value is already taken")
    }
  }

}