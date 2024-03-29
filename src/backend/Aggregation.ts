import chalk from 'chalk'
import { omit, pick } from 'lodash'
import {
  AggregateOptions,
  AggregationCursor as MongoAggregationCursor,
  Collection,
  MongoClient,
} from 'mongodb'

import Model from '../Model.js'
import { AggregationPipelineRaw } from '../aggregation/index.js'
import config from '../config.js'
import { getModelMeta } from '../registry.js'
import { withClientStackTrace } from '../util.js'
import Cursor from './Cursor.js'
import ModelBackend from './ModelBackend.js'

export default class Aggregation<M extends Model> {

  constructor(
    private client: MongoClient,
    private backend: ModelBackend<M> | null,
    private pipeline: AggregationPipelineRaw,
  ) {
    this.collection = client.db().collection(pipeline.collection)
  }

  private readonly collection: Collection

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
  public async pluck(property: string): Promise<any[]>
  public async pluck(...properties: string[]): Promise<Array<{[property: string]: any}>>
  public async pluck(...properties: string[]) {
    return await withClientStackTrace(async () => {
      const projection: Record<string, any> = {}
      for (let property of properties) {
        if (property === 'id') { property = '_id' }
        projection[property] = 1
      }

      let rows = await this.toRawArray()
      rows = rows.map(row => ({
        id: this.meta?.idFromMongo(row._id) ?? row._id,
        ...omit(row, '_id'),
      }))

      if (properties.length === 1) {
        return rows.map(row => row[properties[0]])
      } else {
        return rows.map(row => pick(row, properties))
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
  public raw(options: AggregateOptions = {}): MongoAggregationCursor {
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
