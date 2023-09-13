import Model from '../Model'
import { ModelClass } from '../typings'
import AggregationPipeline from './AggregationPipeline'

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

export interface AggregationPipelineRaw {
  model?:     string
  collection: string
  stages:     Stage[]
}