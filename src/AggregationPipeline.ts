import chalk from 'chalk'
import { omit, omitBy, pick } from 'lodash'
import { AggregationCursor as MongoAggregationCursor, Collection } from 'mongodb'
import AggregationCursor from './AggregationCursor'
import config from './config'
import Model from './Model'
import { ModelClass } from './typings'
import { withClientStackTrace } from './util'

export default class AggregationPipeline<M extends Model> {

  constructor(
    public ModelOrCollection: ModelClass<M> | Collection,
    private stages: Stage[] = []
  ) {
    if (ModelOrCollection instanceof Collection) {
      this.Model      = null
      this.collection = ModelOrCollection as Collection
    } else {
      this.Model      = ModelOrCollection as ModelClass<M>
      this.collection = this.Model.collection
    }
  }

  public readonly Model: ModelClass<M> | null
  public readonly collection: Collection

  private _facetName: string | null = null
  public get facetName() {
    return this._facetName
  }

  //------
  // Stages

  /**
   * Adds an arbitrary stage to the pipeline.
   *
   * @param stage The stage to add.
   */
  public addStage(...stages: Stage[]) {
    this.stages.push(...stages)
    return this
  }

  /**
   * Adds a $match stage to the pipeline.
   * @param $match The $match stage.
   */
  public match($match: MatchStage['$match']) {
    return this.addStage({
      $match: omitBy($match, val => val === undefined),
    })
  }

  /**
   * Adds a $lookup stage to the pipeline.
   *
   * There are two variants of this method:
   *
   * 1. Specifying `localField` and `foreignField`.
   * 2. Not specifying those (but an optional `let`, `pipeline` or `stages` field).
   *
   * The second form returns a new {@link AggregationPipeline} object which you can use
   * to configure the pipeline of the lookup. This is the same object as `pipeline` if you've specified
   * a `pipeline` option, or a newly created pipeline for the model specified in the `from` option,
   * optionally initialized with the stages specified in the `stages` option.
   *
   * @param $lookup The $lookup stage.
   * @returns `this` for variant 1, and a {@link AggregationPipeline} for the lookup for variant 2.
   */
  public lookup($lookup: SimpleLookupConfig): this
  public lookup<M2 extends Model>($lookup: PipelineLookupConfig<M2>): AggregationPipeline<M2>
  public lookup($lookup: SimpleLookupConfig | PipelineLookupConfig<any>) {
    // Check if a simple collection name is specified, if so just pass on.
    if (typeof $lookup.from === 'string') {
      return this.addStage({$lookup})
    }

    // Check for simple lookups using localField & foreignField.
    if ('localField' in $lookup) {
      const {from, ...rest} = $lookup
      return this.addStage({
        $lookup: {
          from:         from.meta.collectionName,
          foreignField: '_id',
          ...rest,
        },
      })
    }

    // Advanced case: wrap lookup pipeline in new AggregationPipeline object.
    const {
      from,
      pipeline: initialPipeline,
      stages,
      ...rest
    } = $lookup as PipelineLookupConfig<any>

    const pipeline = initialPipeline ?? new AggregationPipeline(from, stages)
    this.addStage({
      $lookup: {
        from:     from.meta.collectionName,
        pipeline: pipeline,
        ...rest,
      },
    })

    return pipeline
  }

  /**
   * Adds an `$unwind` stage to the pipeline.
   *
   * @param path The path to unwind.
   * @param options Additional options for the stage.
   */
  public unwind(path: string, options: Omit<UnwindStage['$unwind'], 'path'> = {}) {
    return this.addStage({
      $unwind: {
        path,
        ...options,
      },
    })
  }

  /**
   * Adds a `$group` stage to the pipeline.
   *
   * @param expression The `_id` expression for grouping.
   * @param project Aggregate projections.
   */
  public group(expression: Expression, project?: Record<string, Record<string, any>>) {
    return this.addStage({
      $group: {
        _id: expression,
        ...project,
      },
    })
  }

  /**
   * Adds an `$project` stage to the pipeline.
   *
   * @param $project The $project stage to add.
   */
  public project($project: ProjectStage['$project']) {
    return this.addStage({$project})
  }

  /**
   * Adds an `$addFields` (or `$set`) stage to the pipeline.
   *
   * @param $addFields The $addFields stage to add.
   */
  public addFields($addFields: AddFieldsStage['$addFields']) {
    return this.addStage({$addFields})
  }

  /**
   * Adds a `$sort` stage to the pipeline.
   *
   * @param $sort The $sort stage to add.
   */
  public sort($sort: SortStage['$sort']) {
    return this.addStage({$sort})
  }

  /**
   * Adds a `$limit` stage to the pipeline.
   *
   * @param $limit The $limit stage to add.
   */
  public limit($limit: LimitStage['$limit'] | null) {
    if ($limit == null) { return this }
    return this.addStage({$limit})
  }

  /**
   * Adds a `$skip` stage to the pipeline.
   *
   * @param $skip The $skip stage to add.
   */
  public skip($skip: SkipStage['$skip'] | null) {
    if ($skip == null) { return this }
    return this.addStage({$skip})
  }

  /**
   * Adds a `$count` stage to the pipeline.
   * @param field The field for the $count stage.
   */
  public count(field: string) {
    return this.addStage({$count: field})
  }

  public facet(field: string): AggregationPipeline<M>
  public facet(facets: Record<string, Stage[]>): this
  public facet(arg: string | Record<string, Stage[]>) {
    const facetStageIndex = this.stages.findIndex(it => '$facet' in it) as any
    if (facetStageIndex >= 0 && facetStageIndex !== this.stages.length - 1) {
      throw new Error("You must add all facet stages consecutively")
    }

    if (facetStageIndex < 0) {
      this.addStage({$facet: {}})
    }

    const facetStage = this.stages[this.stages.length - 1] as Record<'$facet', Record<string, Stage[] | {pipeline: AggregationPipeline<M>}>>
    if (typeof arg === 'string') {
      const field    = arg
      const pipeline = new AggregationPipeline(this.Model ?? this.collection, [])
      pipeline._facetName = arg
      facetStage.$facet[field] = {pipeline}
      return pipeline
    } else {
      Object.assign(facetStage.$facet, arg)
      return this
    }
  }

  //------
  // Stage resolution

  public resolveStages(): any[] {
    return this.stages.map(stage => {
      if ('$lookup' in stage && 'pipeline' in stage.$lookup) {
        const {pipeline, ...rest} = stage.$lookup as PipelineLookupConfig<any>
        return {
          $lookup: {
            ...rest,
            pipeline: pipeline?.resolveStages() ?? [],
          },
        }
      } else if ('$facet' in stage) {
        return {
          $facet: Object.entries(stage.$facet).reduce((stage, [field, facet]) => {
            if ('pipeline' in facet) {
              return {...stage, [field]: facet.pipeline.resolveStages()}
            } else {
              return {...stage, [field]: facet}
            }
          }, {}),
        }
      } else {
        return stage
      }
    })
  }

  //------
  // Data retrieval

  /**
   * Counts documents matching the current '$match' stages. Any other operations are not applied.
   */
  public countMatching(): Promise<number> {
    const filters: Record<string, any>[] = []
    for (const stage of this.stages) {
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
   * Retrieves the first (hydrated) model from this pipeline.
   */
  public async first(): Promise<M | null> {
    const documents = await this.limit(1).all()
    return documents[0] ?? null
  }

  /**
   * Asynchronously iterates through all models of this pipeline.
   *
   * @param iterator The iterator to use.
   */
  public async forEach(iterator: (model: M) => any) {
    await this.run().forEach(iterator)
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
        id: this.Model?.meta.idFromMongo(row._id) ?? row._id,
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
  public run(): AggregationCursor<M> {
    if (this.Model == null) {
      throw new Error("Cannot use .run() on a raw aggregation pipeline.")
    }

    return new AggregationCursor(this.Model, this.raw())
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
    const stages = this.resolveStages()
    if (config.traceEnabled) {
      config.logger.debug(chalk`AGG {bold ${this.Model?.name ?? this.collection.collectionName}} {dim ${JSON.stringify(stages)}}`)
    }
    return this.collection.aggregate(stages)
  }

  public toRawArray(): Promise<Record<string, any>[]> {
    return withClientStackTrace(() => {
      const cursor = this.raw()
      return cursor.toArray()
    })
  }

  //------
  // Accumulators

  public static buildAccumulator<S, U = S>(spec: AccumulatorSpec<S, U, any[], any[]>): Record<string, any>
  public static buildAccumulator<S, I extends any[], A extends any[]>(spec: AccumulatorSpec<S, S, I, A>): Record<string, any>
  public static buildAccumulator<S, U, I extends any[], A extends any[]>(spec: AccumulatorSpec<S, U, I, A>): Record<string, any>
  public static buildAccumulator<S, U, I extends any[], A extends any[]>(spec: AccumulatorSpec<S, U, I, A>) {
    return {
      lang: 'js',

      init:     spec.init.toString(),
      initArgs: spec.initArgs,

      accumulate:     spec.accumulate.toString(),
      accumulateArgs: spec.accumulateArgs,

      merge:     spec.merge.toString(),
      finalize:  spec.finalize?.toString(),
    }
  }

}

export type Stage =
  | MatchStage
  | LookupStage
  | UnwindStage
  | ProjectStage
  | GroupStage
  | AddFieldsStage
  | SortStage
  | LimitStage
  | SkipStage
  | CountStage
  | OtherStage

export interface MatchStage {
  $match: Record<string, any>
}

export interface LookupStage {
  $lookup: LookupConfig
}

export type LookupConfig = SimpleLookupConfig | PipelineLookupConfig<any>

export interface CommonLookupConfig {
  as:   string
}

export interface SimpleLookupConfig extends CommonLookupConfig {
  from:          string | ModelClass<any>
  localField:    string
  foreignField?: string
}

export interface PipelineLookupConfig<M extends Model> extends CommonLookupConfig {
  from:      ModelClass<M>
  let?:      Record<string, any>
  pipeline?: AggregationPipeline<M>
  stages?:   Stage[]
}

export interface UnwindStage {
  $unwind: {
    path:                        string
    includeArrayIndex?:          string
    preserveNullAndEmptyArrays?: boolean
  }
}

export interface ProjectStage {
  $project: Record<string, any>
}

export interface GroupStage {
  $group: {
    _id?: Expression
  } & {
    [field: string]: Record<string, Expression>
  }
}

export interface AddFieldsStage {
  $addFields: Record<string, any>
}

export interface SortStage {
  $sort: Record<string, -1 | 1>
}

export interface LimitStage {
  $limit: number
}

export interface SkipStage {
  $skip: number
}

export interface CountStage {
  $count: string
}

export type OtherStage = Record<string, any>

export type Expression = string | number | Record<string, any>

export interface AccumulatorSpec<S, U = S, I extends any[] = [], A extends any[] = []> {
  init:      (...args: I) => S
  initArgs?: I

  accumulate:     (state: S, ...args: A) => S
  accumulateArgs: A

  merge:     (state1: S, state2: S) => S
  finalize?: (state: S) => U

  lang?:      string
}