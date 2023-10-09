import chalk from 'chalk'
import { isArray, isFunction, omitBy } from 'lodash'
import { Collection, DeleteResult, Filter, MongoClient, UpdateFilter } from 'mongodb'
import Validator, { ValidatorResult } from 'validator'
import { isPlainObject, MapBuilder, objectEntries, sparse } from 'ytil'
import config from '../config'
import { callHook } from '../hooks'
import InvalidModelError from '../InvalidModelError'
import Model from '../Model'
import Query from '../Query'
import { getModelMeta } from '../registry'
import { Ref } from '../types/ref'
import { IDOf, ModelClass, SaveOptions, UniqueSpec } from '../typings'
import { deepMapKeys, indexName, withClientStackTrace } from '../util'
import QueryExecutor, { QueryExecutorOptions } from './QueryExecutor'
import ReferentialIntegrity from './ReferentialIntegrity'

export default class ModelBackend<M extends Model> {

  constructor(
    public client: MongoClient,
    public readonly Model: ModelClass<M>,
  ) {}

  public cloneFor<M extends Model>(Model: ModelClass<M>) {
    return new ModelBackend(this.client, Model)
  }

  // #region Meta

  public get meta() {
    return getModelMeta(this.Model)
  }

  public get collection(): Collection {
    if (this.Model === Model as ModelClass<Model>) {
      throw new Error("Cannot access collection of abstract model, use a concrete model or use a colleciton name.")
    }
    return this.client.db().collection(this.meta.collectionName)
  }

  // #endregion

  // #region Initialization

  private initializePromise: Promise<void> | null = null

  public async initialize() {
    this.initializePromise ??= this._initialize()
    return this.initializePromise
  }

  private async _initialize() {
    config.logger.info(chalk`Initializing model {yellow ${this.Model.modelName}}`)
    await this.createIndexes()
  }

  private async createIndexes() {
    for (const index of this.meta.config.indexes ?? []) {
      const [keys, options] = isArray(index) ? index : [index, {}]
      const spec = omitBy(keys, it => it === undefined) as Record<string, number | 'text'>

      const name = indexName(keys, options)
      if (options.name === undefined) {
        options.name = name
      }

      config.logger.debug(`Creating index: ${this.Model.name}.${name}`)
      try {
        // Keep only defined keys.
        this.collection.createIndex(spec, options)
      } catch (error: any) {
        if (error.codeName === 'IndexOptionsConflict') {
          // This we can solve by dropping & recreating the index.
          await this.collection.dropIndex(name)
          await this.collection.createIndex(spec, options)
        } else {
          throw error
        }
      }
    }
  }

  // #endregion

  // #region Query execution

  public query(query: Query<M> = this.Model.query(), options: QueryExecutorOptions = {}) {
    return new QueryExecutor(this, query, options)
  }

  // #endregion

  // #region Refs

  private refCache = new WeakMap<Ref<any>, Model | null>()

  public async getRef<M2 extends Model>(ref: Ref<M2> | null, useCache: boolean = true): Promise<M2 | null> {
    if (ref == null) { return null }

    if (useCache && this.refCache.has(ref)) {
      return this.refCache.get(ref) as M2 | null
    }

    const backend = this.cloneFor(ref.Model)
    const model   = await backend.query().get(ref.id)
    this.refCache.set(ref, model)
    return model
  }

  public async getAllRefs<M2 extends Model>(refs: Ref<M2>[], useCache: boolean = true): Promise<M2[]> {
    const promises = refs.map(it => this.getRef(it, useCache))
    return await Promise.all(promises) as M2[]
  }

  public async getRefMap<M2 extends Model>(refs: Ref<M2>[], useCache: boolean = true): Promise<Map<IDOf<M2>, M2>> {
    const models = await this.getAllRefs(refs, useCache)
    return MapBuilder.by(sparse(models), it => it.id)
  }

  // #endregion

  // #region Create

  /**
   * Creates a new model and saves it immediately.
   *
   * @param attributes
   *  The attributes for the new model.
   * @returns
   *  The created model.
   */
  public async create(attributes: Record<string, any> = {}) {
    const model = new this.Model(attributes)
    await this.save(model)
    return model
  }

  /**
   * Finds or creates a model.
   *
   * @param required
   * 	 The attributes to filter by and the use when creating.
   * @param defaults
   *   Defaults to apply if the model needed to be created. Provide an object of attributes or a function to modify
   *   the model. Note that the attributes or function is only applied if the model did not yet exist.
   * @param updates
   *   Extra attributes to apply if the model needed to be created. Provide an object of attributes or a function
   *   to modify the model. Contrary to `defaults`, these attributes are always applied.
   */
  public async ensure(
    required: Record<string, any>,
    defaults: Record<string, any> | ((model: M) => any) = {},
    updates:  Record<string, any> | ((model: M) => any) = {},
    options:  SaveOptions = {}
  ): Promise<M> {
    const query = this.Model.filter(required)

    let model = await this.query(query).findOne()

    const apply = (model: M, values: Record<string, any> | ((model: M) => any)) => {
      if (isFunction(values)) {
        values(model)
        model.recoerce()
      } else {
        model.assign(values)
      }
    }

    if (model == null) {
      model = new this.Model(required)
      apply(model, defaults)
    }
    apply(model, updates)

    await this.save(model, options)
    return model
  }

  // #endregion

  // #region Save

  /**
   * Saves the model by updating only modified attributes.
   */
  public async save(model: M, options: SaveOptions = {}) {
    if (options.validate !== false) {
      const result = await this.validate(model)
      if (!result.isValid) {
        throw new InvalidModelError(this.Model, result.serialize())
      }
    } else {
      model.recoerce()
    }

    if (options.hooks !== false) {
      await callHook(model, 'beforeSave', this)
    }

    const shouldCreate = !model.isPersisted
    await withClientStackTrace(async () => {
      if (shouldCreate) {
        await this.createModel(model)
      } else {
        await this.updateModel(model)
      }
    })

    if (options.hooks !== false) {
      await callHook(model, 'afterSave', this, shouldCreate)
    }
    model.markPersisted()
  }

  private async createModel(model: M) {
    const now = new Date()
    const document = await this.buildInsertionDocument(model, new Date())
    await this.collection.insertOne(document, {
      bypassDocumentValidation: true,
    })
    model.updatedAt = now
    model.createdAt = now
  }

  private async updateModel(model: M) {
    const filter = {_id: model.mongoID} as Filter<any>

    const now = new Date()
    const update = await this.buildUpdate(model, now)
    if (update == null) { return }

    await this.collection.updateOne(filter, update, {
      bypassDocumentValidation: true,
    })
    model.updatedAt = now
  }

  private async buildInsertionDocument(model: M, now: Date): Promise<Record<string, any>> {
    await model.ensureID()

    const data = this.escapeKeys(model.serialize(false))
    for (const name of this.meta.config.transient ?? []) {
      delete data[name]
    }

    const referentialIntegrity = new ReferentialIntegrity(this, model)
    const document: Record<string, any> = {
      ...data,
      _id:         model.mongoID,
      _references: referentialIntegrity.collectReferences(),
      updatedAt:   now,
      createdAt:   now,
    }
    return document
  }

  private async buildUpdate(model: M, now: Date): Promise<UpdateFilter<any> | null> {
    const $set: Record<string, any> = {
      updatedAt: now,
    }

    const serialized = this.escapeKeys(model.serialize(false))
    for (const [name, value] of Object.entries(serialized)) {
      if (!model.isModified(name as any)) { continue }
      if (this.meta.config.transient?.includes(name)) { continue }
      $set[name] = value
    }
    if (Object.keys($set).length === 0) {
      return null
    }

    const referentialIntegrity = new ReferentialIntegrity(this, model)
    return {
      $set: {
        ...$set,
        _references: referentialIntegrity.collectReferences(),
      },
    }
  }

  // #endregion

  // #region Delete

  public async delete(query: Query<M>): Promise<DeleteResult>
  public async delete(model: M): Promise<DeleteResult>
  public async delete(queryOrModel: Query<M> | M): Promise<DeleteResult> {
    const query = queryOrModel instanceof Model
      ? this.Model.filter({id: queryOrModel.id}).limit(1)
      : queryOrModel

    if (query.limitCount != null && query.limitCount !== 1) {
      throw new Error("Can only delete one single model or all models matched by a query.")
    }

    const models = await this.query(query).find()

    await Promise.all(models.map(it => callHook(it, 'beforeDelete', this)))
    await Promise.all(models.map(async model => {
      const integrity = new ReferentialIntegrity(this, model)
      await integrity.processDeletion()
    }))

    const result = query.limitCount === 1
      ? await this.query(query).deleteOne()
      : await this.query(query).deleteAll()

    if (result.acknowledged && result.deletedCount > 0) {
      for (const model of models) {
        model.markDeleted()
      }
    }

    return result
  }

  // #endregion

  // #region Validation

  public async validate(model: M): Promise<ValidatorResult<this>> {
    model.recoerce()

    if (!await callHook(model, 'beforeValidate') && model.isModified()) {
      model.recoerce()
    }

    const validator = new Validator()
    const result = await validator.validate(
      model.attributes as this,
      model.meta.modelType,
      this.validateExtra.bind(this, model),
    )
    return result
  }

  private async validateExtra(model: M, result: ValidatorResult<this>) {
    await this.validateUnique(model, result)
    await callHook(model, 'validate', result)
  }

  private async validateUnique(model: M, result: ValidatorResult<this>) {
    const serialized = model.serialize()

    for (const [attribute, type] of objectEntries(model.schema)) {
      if (typeof attribute !== 'string') { continue }
      if (type.options.unique == null || type.options.unique === false) { continue }
      if (!model.isModified(attribute)) { continue }

      const value = serialized[attribute]
      if (value == null) { continue }

      await this.validateUniqueAttribute(
        model,
        attribute as keyof M,
        value,
        isPlainObject(type.options.unique) ? type.options.unique : {},
        result
      )
    }
  }

  protected async validateUniqueAttribute(model: M, attribute: keyof M, value: any, spec: UniqueSpec, result: ValidatorResult<this>) {
    if (spec.if != null && !spec.if(this)) { return }

    let query = this.Model.query()
    query = query.filter({[attribute]: value})

    // Use a scope if required.
    if (spec.scope != null) {
      for (const attribute of spec.scope) {
        query = query.filter({[attribute]: value})
      }
    }
    if (spec.query != null) {
      query = spec.query(query, this)
    }

    // Exclude this model instance.

    if (model.id != null) {
      query = query.filter({id: {$ne: model.id}})
    }

    const count = await this.query(query).count()
    if (count > 0) {
      result.for(attribute as string).addError('unique', "This value is already taken")
    }
  }

  // #endregion

  // #region Hydration

  /**
   * Creates a new model by hydration from the database.
   *
   * @param attributes The attributes to hydrate with.
   */
  public async hydrate(document: Document): Promise<M> {
    const model = new this.Model()

    const {_id, ...rest} = this.unescapeKeys(document)
    const id = model.meta.idFromMongo(_id)
    await model.deserialize({id, ...rest})
    return model
  }

  private escapeKeys(data: Record<string, any>) {
    if (!this.meta.config.escapeKeys) { return data }
    return deepMapKeys(data, key => {
      return key.toString()
        .replace(/\\/g, '\\\\')
        .replace(/\./g, '\\u002e')
        .replace(/\$/g, '\\u0024')
    })
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

}