import chalk from 'chalk'
import { isArray, mapKeys, omit } from 'lodash'
import {
  AggregateOptions,
  CountDocumentsOptions,
  DeleteResult,
  Document,
  FindCursor as mongodb_FindCursor,
  UpdateResult,
} from 'mongodb'
import { sparse, wrapArray } from 'ytil'

import Model from '../Model'
import Query from '../Query'
import config from '../config'
import { getModelMeta } from '../registry'
import { ID } from '../typings'
import { withClientStackTrace } from '../util'
import Cursor from './Cursor'
import ModelBackend from './ModelBackend'

export default class QueryExecutor<M extends Model> {

  constructor(
    private readonly backend: ModelBackend<M>,
    private readonly query: Query<M>,
    private readonly options: QueryExecutorOptions = {},
  ) {}

  private get Model() {
    return this.backend.Model
  }

  private get collection() {
    if (this.options.collection) {
      return this.backend.client.db().collection(this.options.collection)
    } else {
      return this.backend.collection
    }
  }

  private get filters() {
    if (this.query.filters.length === 0) { return {} }

    const filters = this.query.filters.map(filter => {
      const {id, ...rest} = filter
      const transformed = {...rest}
      if (id != null) {
        transformed._id = getModelMeta(this.Model).idToMongo(id)
      }
      return transformed
    })

    return {$and: filters}
  }

  private get sorts() {
    const {id, ...rest} = this.query.sorts
    const transformed = {...rest}
    if (id != null) {
      transformed._id = id
    }
    return transformed
  }

  // #region Counting

  public async count(options: CountOptions = {}): Promise<number> {
    if (config.traceEnabled) {
      this.trace(this.query, 'CNT')
    }

    const countDocumentsOptions: CountDocumentsOptions = omit(options, 'skip', 'limit')
    if (options.skip !== undefined) {
      countDocumentsOptions.skip = options.skip ?? undefined
    } else {
      countDocumentsOptions.skip = this.query.skipCount ?? undefined
    }
    if (options.limit !== undefined) {
      countDocumentsOptions.limit = options.limit ?? undefined
    } else {
      countDocumentsOptions.limit = this.query.limitCount ?? undefined
    }

    return await withClientStackTrace(() => (
      this.collection.countDocuments(this.filters, countDocumentsOptions)
    ))
  }

  public async total(options: Omit<CountOptions, 'skip' | 'limit'> = {}): Promise<number> {
    return this.count({skip: 0, limit: null, ...options})
  }

  // #endregion

  // #region Retrieval

  public async get(id: ID): Promise<M | null> {
    if (id == null) {
      throw new TypeError("ID must be specified")
    }

    const meta = getModelMeta(this.Model)
    const mongoID = meta.idToMongo(id)
    const cursor = this.runQuery(this.query.filter({id: mongoID}).limit(1))
    return await cursor.next()
  }

  public async find(): Promise<M[]> {
    return await withClientStackTrace(
      () => this.runQuery(this.query).toArray(),
    )
  }

  public async findOne(): Promise<M | null> {
    const cursor = this.runQuery(this.query.limit(1))
    return await cursor.next()
  }

  // #endregion

  // #region Iteration

  public pluck<K extends keyof M & string>(properties: K, options: PluckOptions & {cursor: true}): mongodb_FindCursor<M[K]>
  public pluck<K extends keyof M & string>(properties: K[], options: PluckOptions & {cursor: true}): mongodb_FindCursor<{[property in K]: M[K]}>
  public pluck<K extends keyof M & string>(properties: K | K[], options: PluckOptions & {cursor: true}): mongodb_FindCursor<M[K] | {[property in K]: M[K]}>

  public pluck<K extends keyof M & string>(properties: K, options?: PluckOptions & {cursor: false}): Promise<Array<M[K]>>
  public pluck<K extends keyof M & string>(properties: K[], options?: PluckOptions & {cursor: false}): Promise<Array<{[property in K]: M[K]}>>
  public pluck<K extends keyof M & string>(properties: K | K[], options?: PluckOptions & {cursor: false}): Promise<Array<M[K] | {[property in K]: M[K]}>>

  public pluck<K extends keyof M & string>(properties: K, options: PluckOptions): mongodb_FindCursor<M[K]> | Promise<Array<M[K]>>
  public pluck<K extends keyof M & string>(properties: K[], options: PluckOptions): mongodb_FindCursor<{[property in K]: M[K]}> | Promise<Array<{[property in K]: M[K]}>>
  public pluck<K extends keyof M & string>(properties: K | K[], options: PluckOptions): mongodb_FindCursor<M[K] | {[property in K]: M[K]}> | Promise<Array<M[K] | {[property in K]: M[K]}>>

  public pluck<K extends keyof M & string>(properties: K | K[], options: PluckOptions = {}): mongodb_FindCursor<M[K] | {[property in K]: M[K]}> | Promise<Array<M[K] | {[property in K]: M[K]}>> {
    const cursor = this.pluckCursor(properties)
    if (options.cursor) {
      return cursor
    } else {
      return withClientStackTrace(() => cursor.toArray())
    }
  }

  private pluckCursor<K extends keyof M & string>(properties: K | K[]): mongodb_FindCursor<M[K] | {[property in K]: M[K]}> {
    const projection = wrapArray(properties).reduce((project, prop) => ({
      ...project,
      [prop === 'id' ? '_id' : prop]: 1,
    }), {})

    const cursor = this.runQueryRaw(this.query.project(projection))
    return cursor.map<M[K]>(doc => {
      const get = (prop: string) => {
        if (prop === 'id') {
          return this.backend.meta.idFromMongo(doc._id)
        } else {
          return doc[prop]
        }
      }

      if (isArray(properties)) {
        return properties.reduce((result, prop) => ({...result, [prop]: get(prop)}), {})
      } else {
        return get(properties[0])
      }
    })
  }

  // #endregion

  // #region Update & delete

  public async updateAll(updates: Record<string, any>): Promise<UpdateResult> {
    return await withClientStackTrace(
      () => this.collection.updateMany(this.filters, updates),
    )
  }

  public async deleteOne(): Promise<DeleteResult> {
    return await withClientStackTrace(
      () => this.collection.deleteOne(this.filters),
    )
  }

  public async deleteAll(): Promise<DeleteResult> {
    return await withClientStackTrace(
      () => this.collection.deleteMany(this.filters),
    )
  }

  // #endregion

  // #region Run & explain

  /**
   * Runs this this.query and returns a cursor returning model instances.
   */
  public run(): Cursor<M> {
    return this.runQuery(this.query)
  }

  private runQuery(query: Query<M>) {
    return new Cursor(this.backend, this.runQueryRaw(query))
  }

  /**
   * Explains this this.query (calls `.explain()` on the underlying cursor).
   */
  public async explain() {
    return await withClientStackTrace(
      () => this.raw().explain(),
    )
  }

  // #endregion

  // #region Raw low-level interface

  /**
   * Runs the this.query and retrieves a raw MongoDB cursor.
   */
  public raw(options: RunQueryRawOptions = {}): mongodb_FindCursor {
    return this.runQueryRaw(this.query, options)
  }

  private runQueryRaw(query: Query<M>, options: RunQueryRawOptions = {}): mongodb_FindCursor {
    const {label} = options

    let cursor = this.collection.find(this.filters)
    if (query.collation != null) {
      cursor = cursor.collation(query.collation)
    }
    if (query.projections != null) {
      const projections = serializeProjections(query.projections)
      cursor = cursor.project(projections)
    }
    cursor = cursor.sort(this.sorts)
    if (query.skipCount != null) {
      cursor = cursor.skip(query.skipCount)
    }
    if (query.limitCount != null) {
      cursor = cursor.limit(query.limitCount)
    }
    if (config.traceEnabled) {
      this.trace(query, label)
    }
    return cursor
  }

  public rawArray(): Promise<Document[]> {
    return withClientStackTrace(() => this.runQueryRaw(this.query).toArray())
  }

  // #endregion

  // #region Tracing

  private trace(query: Query<M>, label: string = 'QRY') {
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
      chalk.magenta(label),
      chalk.bold(this.Model.name + (this.options.collection ? ` (${this.options.collection})` : '')),
      chalk.blue(`[${query.skipCount ?? 0} - ${query.limitCount == null ? '∞' : (query.skipCount ?? 0) + query.limitCount}]`),
      chalk.dim(JSON.stringify(query.filters)),
      source != null ? chalk.dim.underline(source) : null,
    ])

    config.logger.debug(parts.join(' '))
  }

  // #endregion

}

function serializeProjections(projections: Record<string, any>) {
  return mapKeys(projections, (val, key) => key === 'id' ? '_id' : key)
}

export interface QueryExecutorOptions {
  collection?: string
}

export interface CountOptions extends AggregateOptions {
  skip?:  number | null
  limit?: number | null
}

export interface PluckOptions {
  cursor?: boolean
}

interface RunQueryRawOptions {
  label?: string
}
