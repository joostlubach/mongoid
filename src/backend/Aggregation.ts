import chalk from 'chalk'
import { omit, pick } from 'lodash'
import { AggregationCursor as MongoAggregationCursor, Collection } from 'mongodb'
import AggregationPipeline from '../aggregation/AggregationPipeline'
import config from '../config'
import Model from '../Model'
import { withClientStackTrace } from '../util'
import { db } from './client'
import Cursor, { CursorOptions } from './Cursor'
import ModelBackend from './ModelBackend'

export default class Aggregation<M extends Model> {

  constructor(
    private backend: ModelBackend<M>,
    private pipeline: AggregationPipeline<M>
  ) {
    this.collection = db().collection(pipeline.collectionName)
  }

  private readonly collection: Collection

  //------
  // Data retrieval

  /**
   * Counts documents matching the current '$match' stages. Any other operations are not applied.
   */
  public countMatching(): Promise<number> {
    const filters: Record<string, any>[] = []
    for (const stage of this.pipeline.stages()) {
      if (!('$match' in stage)) { continue }
      filters.push(stage.$match)
    }

    return withClientStackTrace(() => (
      this.collection.count({$and: filters})
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
        id: this.pipeline.Model?.meta.idFromMongo(row._id) ?? row._id,
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
    if (this.pipeline.Model == null) {
      throw new Error("Cannot use .run() on a raw aggregation pipeline.")
    }

    return new Cursor(this.backend, this.raw())
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
  public raw(): MongoAggregationCursor {
    const stages = this.pipeline.resolveStages()
    if (config.traceEnabled) {
      config.logger.debug(chalk`AGG {bold ${this.pipeline.Model?.name ?? this.collection.collectionName}} {dim ${JSON.stringify(stages)}}`)
    }
    return this.collection.aggregate(stages)
  }

  public toRawArray(): Promise<Record<string, any>[]> {
    return withClientStackTrace(() => {
      const cursor = this.raw()
      return cursor.toArray()
    })
  }

}

export interface RunOptions extends CursorOptions {}