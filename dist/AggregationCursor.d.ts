import Model from './Model';
import { ModelClass } from './typings';
import { AggregationCursor as MongoAggregationCursor } from 'mongodb';
export default class AggregationCursor<M extends Model> {
    readonly Model: ModelClass<M>;
    readonly cursor: MongoAggregationCursor;
    constructor(Model: ModelClass<M>, cursor: MongoAggregationCursor);
    forEach(iterator: (model: M) => void | Promise<void>): Promise<void>;
    hasNext(): Promise<boolean>;
    next(): Promise<M | null>;
    toArray(): Promise<M[]>;
}
