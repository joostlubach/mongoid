import chalk from 'chalk'
import { isArray } from 'lodash'
import {
  AggregateOptions,
  AggregationCursor as mongodb_AggregationCursor,
  Collection,
  MongoClient,
} from 'mongodb'

import Model from '../Model'
import { AggregationPipeline, AggregationPipelineRaw } from '../aggregation'
import config from '../config'
import { getModelMeta } from '../registry'
import { withClientStackTrace } from '../util'
import Cursor from './Cursor'
import ModelBackend from './ModelBackend'

export default class Aggregation<M extends Model> {

  constructor(
    client: MongoClient,
    private backend: ModelBackend<M> | null,
    pipeline: AggregationPipeline<M> | AggregationPipelineRaw,
  ) {
    this.pipeline = pipeline instanceof AggregationPipeline ? pipeline.serialize() : pipeline
    this.collection = client.db().collection(this.pipeline.collection)
  }

  private readonly collection: Collection
  private readonly pipeline:   AggregationPipelineRaw

  private get Model() {
    return this.backend?.Model ?? null
  }

  private get meta() {
    if (this.Model == null) { return null }
    return getModelMeta(this.Model)
  }

  // ------
  // Data retrieval

  /**
   * Counts documents matching the current '$match' stages. Any other operations are not applied.
   */
  public countMatching(): Promise<number> {
    const filters: Record<string, any>[] = []
    for (const stage of this.pipeline.stages) {
      if (!('$match' in stage)) { continue }
      filters.push(stage.$match)
    }

    return withClientStackTrace(() => (
      this.collection.countDocuments({$and: filters})
    ))
  }

  /**
   * Retrieves all (hydrated) models for this pipeline.
   */
  public async all(): Promise<M[]> {
    return await this.run().toArray()
  }

  /**
   * Without hydrating, plucks the given property from all documents in this pipeline.
   *
   * @param property The property to pluck.
   */


  public pluck<K extends keyof M & string>(properties: K, options: PluckOptions & {cursor: true}): mongodb_AggregationCursor<M[K]>
  public pluck<K extends keyof M & string>(properties: K[], options: PluckOptions & {cursor: true}): mongodb_AggregationCursor<{[property in K]: M[K]}>
  public pluck<K extends keyof M & string>(properties: K | K[], options: PluckOptions & {cursor: true}): mongodb_AggregationCursor<M[K] | {[property in K]: M[K]}>

  public pluck<K extends keyof M & string>(properties: K, options?: PluckOptions & {cursor: false}): Promise<Array<M[K]>>
  public pluck<K extends keyof M & string>(properties: K[], options?: PluckOptions & {cursor: false}): Promise<Array<{[property in K]: M[K]}>>
  public pluck<K extends keyof M & string>(properties: K | K[], options?: PluckOptions & {cursor: false}): Promise<Array<M[K] | {[property in K]: M[K]}>>

  public pluck<K extends keyof M & string>(properties: K, options: PluckOptions): mongodb_AggregationCursor<M[K]> | Promise<Array<M[K]>>
  public pluck<K extends keyof M & string>(properties: K[], options: PluckOptions): mongodb_AggregationCursor<{[property in K]: M[K]}> | Promise<Array<{[property in K]: M[K]}>>
  public pluck<K extends keyof M & string>(properties: K | K[], options: PluckOptions): mongodb_AggregationCursor<M[K] | {[property in K]: M[K]}> | Promise<Array<M[K] | {[property in K]: M[K]}>>

  public pluck<K extends keyof M & string>(properties: K | K[], options: PluckOptions = {}): mongodb_AggregationCursor<M[K] | {[property in K]: M[K]}> | Promise<Array<M[K] | {[property in K]: M[K]}>> {
    const cursor = this.pluckCursor(properties)
    if (options.cursor) {
      return cursor
    } else {
      return withClientStackTrace(() => cursor.toArray())
    }
  }

  private pluckCursor<K extends keyof M & string>(properties: K | K[]): mongodb_AggregationCursor<M[K] | {[property in K]: M[K]}> {
    const projection: Record<string, any> = {}
    for (let property of properties) {
      if (property === 'id') { property = '_id' }
      projection[property] = 1
    }

    const cursor = this.raw().project(projection)
    return cursor.map(doc => {
      const get = (prop: string) => {
        if (prop === 'id' && this.backend != null) {
          return this.backend.meta.idFromMongo(doc._id)
        } else if (prop === 'id') {
          return doc._id
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

  /**
   * Runs this query and returns a cursor returning model instances.
   */
  public run(options: RunOptions = {}): Cursor<M> {
    if (this.backend == null) {
      throw new Error('Cannot use `Aggregation#run()` on a raw aggregation pipeline.')
    }
    return new Cursor(this.backend, this.raw(options))
  }

  /**
   * Explains this query (calls `.explain()` on the underlying cursor).
   */
  public async explain() {
    return await withClientStackTrace(async () => (
      this.raw().explain()
    ))
  }

  /**
   * Runs the query and retrieves a raw MongoDB cursor.
   */
  public raw(options: AggregateOptions = {}): mongodb_AggregationCursor {
    if (config.traceEnabled) {
      config.logger.debug(chalk`AGG {bold ${this.Model?.name ?? this.collection.collectionName}} {dim ${JSON.stringify(this.pipeline.stages)}}`)
    }
    return this.collection.aggregate(this.pipeline.stages, options)
  }

  public toRawArray(options: AggregateOptions = {}): Promise<Record<string, any>[]> {
    return withClientStackTrace(() => {
      const cursor = this.raw(options)
      return cursor.toArray()
    })
  }

}

export interface RunOptions extends AggregateOptions {}

export interface PluckOptions {
  cursor?: boolean
}
