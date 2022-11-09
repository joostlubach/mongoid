import chalk from 'chalk'
import { cloneDeep, mapKeys, omit, pick } from 'lodash'
import {
  CollationOptions,
  Collection,
  CountOptions,
  Document,
  FindCursor as MongoCursor,
  UpdateResult,
} from 'mongodb'
import { sparse } from 'ytil'
import AggregationPipeline from './AggregationPipeline'
import { withClientStackTrace } from './async'
import { emitDelete } from './changes'
import db from './client'
import config from './config'
import Cursor from './Cursor'
import Model from './Model'
import { ID, ModelClass } from './typings'

export type Filter = Record<string, any>

export interface QueryOptions {
  collection?: string
}

export default class Query<M extends Model> {

  //------
  // Construction & properties

  constructor(Model: ModelClass<M>, options: QueryOptions = {}) {
    this.options = options
    this.Model   = Model
  }

  public readonly Model: ModelClass<M>
  private readonly options: QueryOptions

  public copy(): Query<M> {
    const copy = new Query<M>(this.Model, {...this.options})
    copy.filters    = cloneDeep(this.filters)
    copy.sorts      = cloneDeep(this.sorts)
    copy.skipCount  = this.skipCount
    copy.limitCount = this.limitCount
    copy.collation  = this.collation
    return copy
  }

  public switchCollection(collectionName: string) {
    const copy = this.copy()
    copy.options.collection = collectionName
    return copy
  }

  public get collection(): Collection {
    if (this.options.collection != null) {
      return db().collection(this.options.collection)
    } else {
      return this.Model.meta.collection
    }
  }

  public filters:     Filter[] = []
  public projections: AnyObject | null = null
  public sorts:       Record<string, 1 | -1>[] = []
  public skipCount:   number | null = null
  public limitCount:  number | null = null
  public collation:   CollationOptions | null = null

  /**
   * Gets all filters as a `{$and: [...]}` compound. If there are duplicate keys, e.g. two `$or`-keys, this will
   * make sure all filters end up in the Mongo DB query.
   */
  public get compoundFilters(): AnyObject {
    if (this.filters.length === 0) { return {} }
    return {$and: this.filters}
  }

  /**
   * Flattens all filters to a single object. Duplicate keys will be overwritten.
   */
  public get flattenedFilters(): AnyObject {
    return Object.assign({}, ...this.filters)
  }

  //------
  // Modification interface

  public filter(...filters: AnyObject[]): Query<M> {
    const copy = this.copy()

    for (const filter of filters) {
      const {id, ...rest} = removeUndefineds(filter)
      if (id != null) {
        copy.filters.push({_id: id})
      }
      if (Object.keys(rest).length > 0) {
        copy.filters.push(rest)
      }
    }
    return copy
  }

  public removeFilter(name: string) {
    const copy = this.copy()
    copy.filters = this.filters.map(filter => {
      if (name in filter) {
        filter = omit(filter, name)
      }
      if (Object.keys(filter).length === 0) {
        return null
      } else {
        return filter
      }
    }).filter(Boolean) as AnyObject[]

    return copy
  }

  public none() {
    const copy = this.copy()
    copy.filters = [{id: -1}]
    return copy
  }

  public project(projections: AnyObject): Query<M> {
    const copy = this.copy()
    copy.projections = projections
    return copy
  }

  public sort(sorts: AnyObject): Query<M> {
    const {id, ...rest} = sorts
    const copy = this.copy()
    copy.sorts.unshift({...rest, ...(id == null ? null : {_id: id})})
    return copy
  }

  public clearSorts() {
    const copy = this.copy()
    copy.sorts = []
    return copy
  }

  public skip(count: number | null): Query<M> {
    const copy = this.copy()
    copy.skipCount = count
    return copy
  }

  public limit(count: number | null): Query<M> {
    const copy = this.copy()
    copy.limitCount = count
    return copy
  }

  //------
  // Pipeline conversion

  public toPipeline(): AggregationPipeline<M> {
    const pipeline = new AggregationPipeline(this.Model)

    if (Object.keys(this.compoundFilters).length > 0) {
      pipeline.match(this.compoundFilters)
    }
    for (const sort of this.sorts) {
      pipeline.sort(sort)
    }
    if (this.skipCount != null) {
      pipeline.skip(this.skipCount)
    }
    if (this.limitCount != null) {
      pipeline.limit(this.limitCount)
    }
    return pipeline
  }

  //------
  // Data retrieval

  public async count(options: CountOptions = {}): Promise<number> {
    return await this.raw({label: 'CNT'}).count(options)
  }

  public async total(options: CountOptions = {}): Promise<number> {
    return await this.skip(null).limit(null).count(options)
  }

  public async get(id: ID): Promise<M | null> {
    if (id == null) {
      throw new TypeError("ID must be specified")
    }

    const mongoID = this.Model.meta.idToMongo(id)
    return await this.findOne({id: mongoID})
  }

  public async all(): Promise<M[]> {
    return await withClientStackTrace(
      () => this.run().toArray()
    )
  }

  public async first(): Promise<M | null> {
    const documents = await this.limit(1).all()
    return documents[0] ?? null
  }

  public async findOne(filters?: AnyObject): Promise<M | null> {
    return await this.filter(filters || {}).first()
  }

  public async forEach(iterator: (model: M) => any) {
    return await withClientStackTrace(async () => {
      await this.run().forEach(iterator)
    })
  }

  public async map<T>(iterator: (model: M, index: number) => T | Promise<T>): Promise<T[]> {
    return await withClientStackTrace(async () => {
      const results: T[] = []
      let index = 0
      await this.run().forEach(async model => {
        results.push(await iterator(model, index++))
      })
      return results
    })
  }

  public async pluck<T = any>(property: string): Promise<T[]>
  public async pluck<T = any>(firstProperty: string, ...properties: string[]): Promise<Array<{[property: string]: T}>>
  public async pluck(...properties: string[]) {
    return await withClientStackTrace(async () => {
      const projection: AnyObject = {}
      for (let property of properties) {
        if (property === 'id') { property = '_id' }
        projection[property] = 1
      }

      const values: any[] = []
      await this.raw(projection).forEach(doc => {
        const get = (prop: string) => doc[prop === 'id' ? '_id' : prop]
        if (properties.length === 1) {
          values.push(get(properties[0]))
        } else {
          values.push(properties.reduce((result, prop) => ({...result, [prop]: get(prop)}), {}))
        }
      })
      return values
    })
  }

  /**
   * Runs this query and returns a cursor returning model instances.
   */
  public run(options: RunOptions = {}): Cursor<M> {
    return new Cursor(this, this.raw(options))
  }

  /**
   * Explains this query (calls `.explain()` on the underlying cursor).
   */
  public async explain() {
    return await withClientStackTrace(
      () => this.raw().explain()
    )
  }

  /**
   * Runs the query and retrieves a raw MongoDB cursor.
   */
  public raw(options: RunOptions = {}): MongoCursor {
    const {
      project = serializeProjections(this.projections),
      trace   = config.traceEnabled,
      label,
    } = options

    let cursor = this.collection
      .find(this.compoundFilters)

    if (this.collation != null) {
      cursor = cursor.collation(this.collation)
    }

    if (project != null) {
      cursor = cursor.project(project)
    }

    for (const sort of this.sorts) {
      cursor = cursor.sort(sort)
    }

    if (this.skipCount != null) {
      cursor = cursor.skip(this.skipCount)
    }
    if (this.limitCount != null) {
      cursor = cursor.limit(this.limitCount)
    }

    if (trace) {
      // Find out the origin.
      const stackTarget = {} as {stack: string}
      Error.captureStackTrace(stackTarget)

      let source: string | null = null
      for (const site of stackTarget.stack.split('\n').slice(1)) {
        if (site.includes('mongoid')) { continue }
        source = site.trim()
        break
      }

      const parts = sparse([
        chalk.magenta(label ?? 'QRY'),
        chalk.bold(this.Model.name + (this.options.collection ? ` (${this.options.collection})` : '')),
        chalk.blue(`[${this.skipCount ?? 0} - ${this.limitCount == null ? '∞' : (this.skipCount ?? 0) + this.limitCount}]`),
        chalk.dim(JSON.stringify(this.filters)),
        source != null ? chalk.dim.underline(source) : null,
      ])
      config.logger.debug(parts.join(' '))
    }

    return cursor
  }

  public toRawArray() {
    return withClientStackTrace(() => this.raw().toArray())
  }

  //------
  // Updates

  /**
   * Updates matching documents with new values.
   *
   * @param updates The updates.
   */
  public async update(updates: AnyObject): Promise<UpdateResult | Document> {
    return await withClientStackTrace(
      () => this.collection.updateMany(this.compoundFilters, updates)
    )
  }

  /**
   * Deletes matching documents.
   */
  public async delete(triggerChange = true) {
    if (triggerChange) {
      this.filter(this.compoundFilters).forEach(model => {
        emitDelete(model)
      })
    }

    return await withClientStackTrace(
      () => this.collection.deleteMany(this.compoundFilters)
    )
  }

  //-------
  // Serialization

  public serialize() {
    return pick(this, ['filters', 'projections', 'sorts', 'skipCount', 'limitCount', 'collation'])
  }

  public static deserialize<M extends Model = any>(Model: ModelClass<M>, raw: AnyObject): Query<M> {
    const query = new Query(Model)
    Object.assign(query, raw)
    return query
  }

}

function serializeProjections(projections: Record<string, any> | null) {
  if (projections == null) { return null }
  return mapKeys(projections, (val, key) => key === 'id' ? '_id' : key)
}

function removeUndefineds(filters: AnyObject) {
  const result: AnyObject = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

export interface RunOptions {
  trace?:   boolean
  label?:   string
  project?: AnyObject | null
}