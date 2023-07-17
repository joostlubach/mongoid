import { Type, TypeOptions } from 'validator';
import Model from '../Model';
import { ID } from '../typings';
import { Ref, RefDeleteStrategy, RefModel } from './ref';
export interface Options<PM extends Model = any> {
    models?: string[];
    onDelete?: RefDeleteStrategy<PM>;
}
declare function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM> & {
    required: false;
}): Type<PolymorphicRef> & {
    options: {
        required: false;
    };
};
declare function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM> & {
    required?: true;
}): Type<PolymorphicRef> & {
    options: {
        required: true;
    };
};
export declare class PolymorphicRef<M extends Model = any> extends Ref<M> {
    constructor(Model: RefModel<M>, id: ID);
    get(): Promise<M | null>;
}
export declare function isPolymorphicRef<M extends Model = any>(value: any): value is PolymorphicRef<M>;
export default polymorphicRef;
