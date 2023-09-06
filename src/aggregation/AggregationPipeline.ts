import { omitBy } from 'lodash'
import Model from '../Model'
import { ModelClass } from '../typings'
import {
  AccumulatorSpec,
  AddFieldsStage,
  Expression,
  LimitStage,
  MatchStage,
  PipelineLookupConfig,
  ProjectStage,
  SimpleLookupConfig,
  SkipStage,
  SortStage,
  Stage,
  UnwindStage,
} from './typings'

export default class AggregationPipeline<M extends Model> {

  constructor(
    public ModelOrCollectionName: ModelClass<M> | string,
    private _stages: Stage[] = []
  ) {
    if (typeof ModelOrCollectionName === 'string') {
      this.Model          = null
      this.collectionName = ModelOrCollectionName
    } else {
      this.Model          = ModelOrCollectionName
      this.collectionName = this.Model.meta.collectionName
    }
  }

  public readonly Model: ModelClass<M> | null
  public readonly collectionName: string

  private _facetName: string | null = null
  public get facetName() {
    return this._facetName
  }

  //------
  // Stages

  public stages() {
    return this._stages
  }

  /**
   * Adds an arbitrary stage to the pipeline.
   *
   * @param stage The stage to add.
   */
  public addStage(...stages: Stage[]) {
    this._stages.push(...stages)
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
    const facetStageIndex = this._stages.findIndex(it => '$facet' in it) as any
    if (facetStageIndex >= 0 && facetStageIndex !== this._stages.length - 1) {
      throw new Error("You must add all facet stages consecutively")
    }

    if (facetStageIndex < 0) {
      this.addStage({$facet: {}})
    }

    const facetStage = this._stages[this._stages.length - 1] as Record<'$facet', Record<string, Stage[] | {pipeline: AggregationPipeline<M>}>>
    if (typeof arg === 'string') {
      const field    = arg
      const pipeline = new AggregationPipeline(this.Model ?? this.collectionName, [])
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
    return this._stages.map(stage => {
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
          $facet: Object.entries(stage.$facet as Record<string, Stage>).reduce((stage, [field, facet]) => {
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