import { ObjectSchema } from 'validator';
import Model from './Model';
import { ModelClass } from './typings';
interface Trait<T extends AnyMixin> {
    <M extends Model>(Base: ModelClass<M>): ModelClass<M & MixinInstance<T>> & MixinStatics<T>;
    schema: ObjectSchema;
}
interface ConfigurableTrait<T extends AnyMixin, Cfg> {
    <M extends Model>(Base: ModelClass<M>, config?: Partial<Cfg>): ModelClass<M & MixinInstance<T>> & MixinStatics<T>;
    schema: ObjectSchema;
    config: (Target: any) => Cfg;
}
export declare const CONFIGS: WeakMap<any, [ConfigurableTrait<any, any>, any]>;
export declare function trait<T extends AnyMixin>(schema: ObjectSchema, Mixin: T): Trait<T>;
export declare function trait<T extends AnyMixin, Cfg>(schema: ObjectSchema, Mixin: T, defaultConfig: Cfg): ConfigurableTrait<T, Cfg>;
export type Constructor<T> = new (...args: any[]) => T;
export type Mixin<I, S> = S & {
    prototype: I;
};
export type AnyMixin = Mixin<any, any>;
declare type MixinInstance<T extends AnyMixin | Constructor<any>> = T extends {
    prototype: infer I;
} ? I : T extends Constructor<infer I> ? I : never;
declare type MixinStatics<T extends AnyMixin | Constructor<any>> = Omit<T, 'new' | 'constructor'>;
export {};
