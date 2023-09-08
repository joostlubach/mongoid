import chalk from 'chalk'
import { mapKeys, omit } from 'lodash'
import {
  AggregateOptions,
  CountDocumentsOptions,
  DeleteResult,
  Document,
  FindCursor as MongoCursor,
  UpdateResult,
} from 'mongodb'
import { sparse } from 'ytil'
import config from '../config'
import Model from '../Model'
import Query from '../Query'
import { getModelMeta } from '../registry'
import { ID } from '../typings'
import { withClientStackTrace } from '../util'
import Cursor, { CursorOptions } from './Cursor'
import ModelBackend from './ModelBackend'

export default class QueryExecutor<M extends Model> {

  constructor(
    private readonly backend: ModelBackend<M>,
    private readonly query: Query<M>,
  ) {}

  private get Model() {
    return this.backend.Model
  }

  private get collection() {
    return this.backend.collection
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

    return await this.collection.countDocuments(this.query.compoundFilters, countDocumentsOptions)
  }

  public async total(options: Omit<CountOptions, 'skip' | 'limit'> = {}): Promise<number> {
    return this.count({skip: 0, limit: null})
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
      () => this.run(this.query).toArray()
    )
  }

  public async findOne(): Promise<M | null> {
    const cursor = this.runQuery(this.query.limit(1))
    return await cursor.next()
  }

  // #endregion

  // #region Iteration

  public async pluck<T = any>(property: string): Promise<T[]>
  public async pluck<T = any>(firstProperty: string, ...properties: string[]): Promise<Array<{[property: string]: T}>>
  public async pluck(...properties: string[]) {
    return await withClientStackTrace(async () => {
      const project = properties.reduce((project, prop) => ({
        ...project,
        [prop === 'id' ? '_id' : prop]: 1,
      }), {})

      const values: any[] = []
      await this.raw(this.query.project(project)).forEach(doc => {
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

  // #endregion

  // #region Update & delete

  public async updateAll(updates: Record<string, any>): Promise<UpdateResult> {
    return await withClientStackTrace(
      () => this.collection.updateMany(this.query.compoundFilters, updates)
    )
  }

  public async deleteAll(): Promise<DeleteResult> {
    return await withClientStackTrace(
      () => this.collection.deleteMany(this.query.compoundFilters)
    )
  }

  // #endregion

  // #region Run & explain

  /**
   * Runs this this.query and returns a cursor returning model instances.
   */
  public run(options: RunOptions = {}): Cursor<M> {
    return this.runQuery(this.query, options)
  }

  private runQuery(query: Query<M>, options: RunOptions = {}) {
    const {include, ...rest} = options
    return new Cursor(this.backend, this.runQueryRaw(query, rest), {include})
  }

  /**
   * Explains this this.query (calls `.explain()` on the underlying cursor).
   */
  public async explain() {
    return await withClientStackTrace(
      () => this.raw().explain()
    )
  }

  // #endregion

  // #region Raw low-level interface

  /**
   * Runs the this.query and retrieves a raw MongoDB cursor.
   */
  public raw(options: RunOptions = {}): MongoCursor {
    return this.runQueryRaw(this.query, options)
  }

  private runQueryRaw(query: Query<M>, options: RunOptions): MongoCursor {
    const {
      project = serializeProjections(query.projections),
      trace   = config.traceEnabled,
      label,
    } = options

    let cursor = this.collection.find(query.compoundFilters)
    if (query.collation != null) {
      cursor = cursor.collation(query.collation)
    }
    if (project != null) {
      cursor = cursor.project(project)
    }
    for (const sort of query.sorts) {
      cursor = cursor.sort(sort)
    }
    if (query.skipCount != null) {
      cursor = cursor.skip(query.skipCount)
    }
    if (query.limitCount != null) {
      cursor = cursor.limit(query.limitCount)
    }
    if (trace) {
      this.trace(query, label)
    }
    return cursor
  }

  public rawArray(): Promise<Document[]> {
    return withClientStackTrace(() => this.raw(this.query).toArray())
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
      chalk.bold(query.Model.name + (query.options.collection ? ` (${query.options.collection})` : '')),
      chalk.blue(`[${query.skipCount ?? 0} - ${query.limitCount == null ? '∞' : (query.skipCount ?? 0) + query.limitCount}]`),
      chalk.dim(JSON.stringify(query.filters)),
      source != null ? chalk.dim.underline(source) : null,
    ])

    config.logger.debug(parts.join(' '))
  }

  // #endregion

}

function serializeProjections(projections: Record<string, any> | null) {
  if (projections == null) { return null }
  return mapKeys(projections, (val, key) => key === 'id' ? '_id' : key)
}

export interface CountOptions extends AggregateOptions {
  skip?:  number | null
  limit?: number | null
}

export interface RunOptions extends CursorOptions {
  trace?:   boolean
  label?:   string
  project?: Record<string, any> | null
}