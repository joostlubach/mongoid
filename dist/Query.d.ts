import { CollationOptions, Collection, CountOptions, Document, FindCursor as MongoCursor, UpdateResult } from 'mongodb';
import AggregationPipeline from './AggregationPipeline';
import Cursor from './Cursor';
import Model from './Model';
import { ID, ModelClass } from './typings';
export type Filter = Record<string, any>;
export interface QueryOptions {
    collection?: string;
}
export default class Query<M extends Model> {
    constructor(Model: ModelClass<M>, options?: QueryOptions);
    readonly Model: ModelClass<M>;
    private readonly options;
    copy(): Query<M>;
    switchCollection(collectionName: string): Query<M>;
    get collection(): Collection;
    filters: Filter[];
    projections: Record<string, any> | null;
    sorts: Record<string, 1 | -1>[];
    skipCount: number | null;
    limitCount: number | null;
    collation: CollationOptions | null;
    /**
     * Gets all filters as a `{$and: [...]}` compound. If there are duplicate keys, e.g. two `$or`-keys, this will
     * make sure all filters end up in the Mongo DB query.
     */
    get compoundFilters(): Record<string, any>;
    /**
     * Flattens all filters to a single object. Duplicate keys will be overwritten.
     */
    get flattenedFilters(): Record<string, any>;
    filter(...filters: Record<string, any>[]): Query<M>;
    removeFilter(name: string): Query<M>;
    clearFilters(): Query<M>;
    none(): Query<M>;
    project(projections: Record<string, any>): Query<M>;
    sort(sorts: Record<string, any>): Query<M>;
    clearSorts(): Query<M>;
    skip(count: number | null): Query<M>;
    limit(count: number | null): Query<M>;
    union(other: Query<M>): Query<M>;
    toPipeline(): AggregationPipeline<M>;
    count(options?: CountOptions): Promise<number>;
    total(options?: CountOptions): Promise<number>;
    get(id: ID): Promise<M | null>;
    all(): Promise<M[]>;
    first(): Promise<M | null>;
    findOne(filters?: Record<string, any>): Promise<M | null>;
    forEach(iterator: (model: M) => any): Promise<void>;
    map<T>(iterator: (model: M, index: number) => T | Promise<T>): Promise<T[]>;
    pluck<T = any>(property: string): Promise<T[]>;
    pluck<T = any>(firstProperty: string, ...properties: string[]): Promise<Array<{
        [property: string]: T;
    }>>;
    /**
     * Runs this query and returns a cursor returning model instances.
     */
    run(options?: RunOptions): Cursor<M>;
    /**
     * Explains this query (calls `.explain()` on the underlying cursor).
     */
    explain(): Promise<Document>;
    /**
     * Runs the query and retrieves a raw MongoDB cursor.
     */
    raw(options?: RunOptions): MongoCursor;
    toRawArray(): Promise<any[]>;
    private trace;
    /**
     * Updates matching documents with new values.
     *
     * @param updates The updates.
     */
    update(updates: Record<string, any>): Promise<UpdateResult | Document>;
    /**
     * Deletes matching documents.
     */
    delete(triggerChange?: boolean): Promise<import("mongodb").DeleteResult>;
    serialize(): Pick<this, "filters" | "projections" | "sorts" | "skipCount" | "limitCount" | "collation">;
    static deserialize<M extends Model = any>(Model: ModelClass<M>, raw: Record<string, any>): Query<M>;
}
export interface RunOptions {
    trace?: boolean;
    label?: string;
    project?: Record<string, any> | null;
    include?: string[];
}
