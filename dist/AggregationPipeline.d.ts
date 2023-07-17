import { AggregationCursor as MongoAggregationCursor, Collection } from 'mongodb';
import AggregationCursor from './AggregationCursor';
import Model from './Model';
import { ModelClass } from './typings';
export default class AggregationPipeline<M extends Model> {
    ModelOrCollection: ModelClass<M> | Collection;
    private stages;
    constructor(ModelOrCollection: ModelClass<M> | Collection, stages?: Stage[]);
    readonly Model: ModelClass<M> | null;
    readonly collection: Collection;
    private _facetName;
    get facetName(): string | null;
    /**
     * Adds an arbitrary stage to the pipeline.
     *
     * @param stage The stage to add.
     */
    addStage(...stages: Stage[]): this;
    /**
     * Adds a $match stage to the pipeline.
     * @param $match The $match stage.
     */
    match($match: MatchStage['$match']): this;
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
    lookup($lookup: SimpleLookupConfig): this;
    lookup<M2 extends Model>($lookup: PipelineLookupConfig<M2>): AggregationPipeline<M2>;
    /**
     * Adds an `$unwind` stage to the pipeline.
     *
     * @param path The path to unwind.
     * @param options Additional options for the stage.
     */
    unwind(path: string, options?: Omit<UnwindStage['$unwind'], 'path'>): this;
    /**
     * Adds a `$group` stage to the pipeline.
     *
     * @param expression The `_id` expression for grouping.
     * @param project Aggregate projections.
     */
    group(expression: Expression, project?: Record<string, Record<string, any>>): this;
    /**
     * Adds an `$project` stage to the pipeline.
     *
     * @param $project The $project stage to add.
     */
    project($project: ProjectStage['$project']): this;
    /**
     * Adds an `$addFields` (or `$set`) stage to the pipeline.
     *
     * @param $addFields The $addFields stage to add.
     */
    addFields($addFields: AddFieldsStage['$addFields']): this;
    /**
     * Adds a `$sort` stage to the pipeline.
     *
     * @param $sort The $sort stage to add.
     */
    sort($sort: SortStage['$sort']): this;
    /**
     * Adds a `$limit` stage to the pipeline.
     *
     * @param $limit The $limit stage to add.
     */
    limit($limit: LimitStage['$limit'] | null): this;
    /**
     * Adds a `$skip` stage to the pipeline.
     *
     * @param $skip The $skip stage to add.
     */
    skip($skip: SkipStage['$skip'] | null): this;
    /**
     * Adds a `$count` stage to the pipeline.
     * @param field The field for the $count stage.
     */
    count(field: string): this;
    facet(field: string): AggregationPipeline<M>;
    facet(facets: Record<string, Stage[]>): this;
    resolveStages(): any[];
    /**
     * Counts documents matching the current '$match' stages. Any other operations are not applied.
     */
    countMatching(): Promise<number>;
    /**
     * Retrieves all (hydrated) models for this pipeline.
     */
    all(): Promise<M[]>;
    /**
     * Retrieves the first (hydrated) model from this pipeline.
     */
    first(): Promise<M | null>;
    /**
     * Asynchronously iterates through all models of this pipeline.
     *
     * @param iterator The iterator to use.
     */
    forEach(iterator: (model: M) => any): Promise<void>;
    /**
     * Without hydrating, plucks the given property from all documents in this pipeline.
     *
     * @param property The property to pluck.
     */
    pluck(property: string): Promise<any[]>;
    pluck(...properties: string[]): Promise<Array<{
        [property: string]: any;
    }>>;
    /**
     * Runs this query and returns a cursor returning model instances.
     */
    run(): AggregationCursor<M>;
    /**
     * Explains this query (calls `.explain()` on the underlying cursor).
     */
    explain(): Promise<import("mongodb").Document>;
    /**
     * Runs the query and retrieves a raw MongoDB cursor.
     */
    raw(): MongoAggregationCursor;
    toRawArray(): Promise<Record<string, any>[]>;
    static buildAccumulator<S, U = S>(spec: AccumulatorSpec<S, U, any[], any[]>): Record<string, any>;
    static buildAccumulator<S, I extends any[], A extends any[]>(spec: AccumulatorSpec<S, S, I, A>): Record<string, any>;
    static buildAccumulator<S, U, I extends any[], A extends any[]>(spec: AccumulatorSpec<S, U, I, A>): Record<string, any>;
}
export type Stage = MatchStage | LookupStage | UnwindStage | ProjectStage | GroupStage | AddFieldsStage | SortStage | LimitStage | SkipStage | CountStage | OtherStage;
export interface MatchStage {
    $match: Record<string, any>;
}
export interface LookupStage {
    $lookup: LookupConfig;
}
export type LookupConfig = SimpleLookupConfig | PipelineLookupConfig<any>;
export interface CommonLookupConfig {
    as: string;
}
export interface SimpleLookupConfig extends CommonLookupConfig {
    from: string | ModelClass<any>;
    localField: string;
    foreignField?: string;
}
export interface PipelineLookupConfig<M extends Model> extends CommonLookupConfig {
    from: ModelClass<M>;
    let?: Record<string, any>;
    pipeline?: AggregationPipeline<M>;
    stages?: Stage[];
}
export interface UnwindStage {
    $unwind: {
        path: string;
        includeArrayIndex?: string;
        preserveNullAndEmptyArrays?: boolean;
    };
}
export interface ProjectStage {
    $project: Record<string, any>;
}
export interface GroupStage {
    $group: {
        _id?: Expression;
    } & {
        [field: string]: Record<string, Expression>;
    };
}
export interface AddFieldsStage {
    $addFields: Record<string, any>;
}
export interface SortStage {
    $sort: Record<string, -1 | 1>;
}
export interface LimitStage {
    $limit: number;
}
export interface SkipStage {
    $skip: number;
}
export interface CountStage {
    $count: string;
}
export type OtherStage = Record<string, any>;
export type Expression = string | number | Record<string, any>;
export interface AccumulatorSpec<S, U = S, I extends any[] = [], A extends any[] = []> {
    init: (...args: I) => S;
    initArgs?: I;
    accumulate: (state: S, ...args: A) => S;
    accumulateArgs: A;
    merge: (state1: S, state2: S) => S;
    finalize?: (state: S) => U;
    lang?: string;
}
