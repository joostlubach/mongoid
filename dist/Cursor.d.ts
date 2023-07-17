import { FindCursor as MongoCursor } from 'mongodb';
import Model from './Model';
import Query from './Query';
export default class Cursor<M extends Model> {
    readonly query: Query<M>;
    readonly cursor: MongoCursor;
    private readonly options;
    constructor(query: Query<M>, cursor: MongoCursor, options: CursorOptions);
    private get Model();
    count(): Promise<number>;
    forEach(iterator: (model: M) => void | Promise<void>): Promise<void>;
    map<U>(iterator: (model: M) => U | Promise<U>): Promise<Promise<U>[]>;
    hasNext(): Promise<boolean>;
    next(): Promise<M | null>;
    toArray(): Promise<M[]>;
    private includeRefs;
    private findIncludeRefs;
}
export interface CursorOptions {
    include?: string[];
}
