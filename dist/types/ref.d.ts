import { Type, TypeOptions } from 'validator';
import Model from '../Model';
import Query from '../Query';
import { ID, IDOf } from '../typings';
import type { Reference } from '../ReferentialIntegrity';
export interface Options<PM extends Model = any> {
    /** The name of the model for the ref */
    model: string;
    /** The foreign key to use (defaults to `id`.) */
    foreignKey?: string;
    /**
     * The strategy to use when the referenced object is deleted.
     *
     * Default: `'ignore'`.
     */
    onDelete?: RefDeleteStrategy<PM>;
    /**
     * Set to true to always include this ref when the containing model is loaded.
     */
    include?: RefInclude;
}
export interface RefOptions<PM extends Model = any> {
    foreignKey?: string;
    onDelete?: RefDeleteStrategy<PM>;
    include?: RefInclude;
}
export interface RefModel<M extends Model = any> {
    name: string;
    query(): Query<M>;
}
export type RefDeleteStrategy<PM extends Model> = 
/** Disallow the deletion. */
'disallow'
/** Ignore the reference. This will lead to an inconsistent referential integrity, but may be useful for logging purposes. */
 | 'ignore'
/** Cascade-delete the owning model. */
 | 'cascade'
/** Fast-delete the owning model. This will not perform additional referential integrity checks. */
 | 'delete'
/** Unset the reference (set to `null` for single ref, or remove from array in case of an array of refs). */
 | 'unset'
/** Set to specific value. */
 | {
    $set: ID;
}
/** Custom. */
 | CustomDeleteStrategy<PM>;
export type CustomDeleteStrategy<PM extends Model> = ((model: PM, reference: Reference) => boolean | Promise<boolean>);
declare function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM> & {
    required: false;
}): Type<Ref<M>> & {
    options: {
        required: false;
    };
};
declare function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM> & {
    required?: true;
}): Type<Ref<M>> & {
    options: {
        required: true;
    };
};
export declare class Ref<M extends Model = any> {
    constructor(Model: RefModel<any>, id: IDOf<M>, options?: RefOptions);
    readonly Model: RefModel<any>;
    readonly id: IDOf<M>;
    readonly foreignKey: string;
    readonly include: RefInclude;
    protected cache: M | null | undefined;
    get(): Promise<M | null>;
    getCached(): M | null | undefined;
    fetch(): Promise<M | null>;
    reload(): Promise<void>;
    static getAll<M extends Model>(refs: Array<Ref<M>>, cache?: boolean): Promise<M[]>;
    static getMap<M extends Model>(refs: Array<Ref<M>>): Promise<Map<ID, M>>;
    equals(other: Ref<M>): boolean;
    [Symbol.toPrimitive](): ID;
    toString(): ID;
}
export type RefInclude = 'always' | 'never' | 'auto';
export type CachedRef<M extends Model> = Ref<M> & {
    getCached: () => M | null;
};
export declare function isRef<M extends Model>(arg: any): arg is Ref<M>;
export default ref;
export declare function isSetStrategy(strategy: RefDeleteStrategy<any>): strategy is {
    $set: ID;
};
export declare function isCustomStrategy<PM extends Model>(strategy: RefDeleteStrategy<PM>): strategy is CustomDeleteStrategy<PM>;
