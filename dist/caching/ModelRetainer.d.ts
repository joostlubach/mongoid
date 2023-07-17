import { Logger } from 'winston';
import Model from '../Model';
import Query from '../Query';
import { Ref } from '../types/ref';
import { IDOf, ModelClass } from '../typings';
export interface ModelRetainerOptions<M extends Model> {
    retain?: boolean;
    fetch?: () => Promise<M | null>;
    filter?: (query: Query<M>) => Query<M>;
    onFetch?: (model: M) => any;
    onFree?: (model: M) => any;
    logger?: Logger;
    notFoundError?: (message: string) => Error;
}
/**
 * For memory usage optimization, a way to pass a model reference around, without the need for frequent queries.
 * The retainer has two modes of operations:
 *
 * 1. Simple mode: initialize the retainer and use `.get()` subsequent times. When the retainer is freed from memory, so is
 *    the model reference.
 * 2. ARC mode: initialize the retainer and use `.retain()` and `.release()` as necessary. When the retain count hits 0,
 *    the model is freed. A callback is also invoked, allowing the site holding the retainer to release the retainer itself.
 */
export default class ModelRetainer<M extends Model> {
    readonly Model: ModelClass<M>;
    readonly locator: IDOf<M> | M | Ref<M>;
    private readonly options;
    constructor(Model: ModelClass<M>, locator: IDOf<M> | M | Ref<M>, options?: ModelRetainerOptions<M>);
    readonly id: IDOf<M>;
    private retainCount;
    retain(): void;
    release(): void;
    private model;
    get isRetained(): boolean;
    set(model: M): void;
    get cached(): M | null;
    get ref(): Ref<any>;
    get(options?: {
        retain?: boolean;
        reload?: boolean;
        throws?: true;
    }): Promise<M>;
    get(options: {
        retain?: boolean;
        reload?: boolean;
        throws: false;
    }): Promise<M | null>;
    get(options?: {
        retain?: boolean;
        reload?: boolean;
        throws?: boolean;
    }): Promise<M | null>;
    fetch(options?: {
        throws: true;
    }): Promise<M>;
    fetch(options: {
        throws: false;
    }): Promise<M | null>;
    fetch(options?: {
        throws?: boolean;
    }): Promise<M | null>;
    private fetchPromise?;
    private getFetchPromise;
    replace(model: M): void;
    private free;
}
