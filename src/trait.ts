import { ObjectSchema } from 'validator'
import { getHooks, registerHook } from './hooks'
import Model from './Model'
import { ModelClass } from './typings'

interface Trait<T extends AnyMixin> {
  <M extends Model>(Base: ModelClass<M>): ModelClass<M & MixinInstance<T>> & MixinStatics<T>
  schema: ObjectSchema
}
interface ConfigurableTrait<T extends AnyMixin, Cfg> {
  <M extends Model>(Base: ModelClass<M>, config?: Partial<Cfg>): ModelClass<M & MixinInstance<T>> & MixinStatics<T>
  schema: ObjectSchema
  config: (Target: any) => Cfg
}

export const CONFIGS: WeakMap<any, [ConfigurableTrait<any, any>, any]> = new WeakMap()

export function trait<T extends AnyMixin>(schema: ObjectSchema, Mixin: T): Trait<T>
export function trait<T extends AnyMixin, Cfg>(schema: ObjectSchema, Mixin: T, defaultConfig: Cfg): ConfigurableTrait<T, Cfg>
export function trait<T extends AnyMixin, Cfg>(schema: ObjectSchema, Mixin: T, defaultConfig?: Cfg) {
  const fn: ConfigurableTrait<T, Cfg> = <M extends Model>(Base: Constructor<M>, config: Record<string, any> = {}) => {
    class Extended extends (Base as any) {}
    mixin(Extended, Mixin)
    registerHooks(Extended, Mixin)

    CONFIGS.set(Extended, [fn, {...defaultConfig, ...config}])
    return Extended as any
  }

  fn.schema = schema
  fn.config = (Target: any) => {
    for (let C = Target; C != null; C = (C as any).__proto__) {
      if (!CONFIGS.has(C)) { continue }

      const [trait, config] = CONFIGS.get(C)!
      if (trait !== fn) { continue }

      return config
    }
    return defaultConfig
  }

  return fn as any
}

function mixin(Target: any, Mixin: AnyMixin) {
  for (const name of Object.getOwnPropertyNames(Mixin.prototype)) {
    if (name === 'constructor') { continue }

    Target.prototype[name] = Mixin.prototype[name]
  }
  for (const symbol of Object.getOwnPropertySymbols(Mixin.prototype)) {
    Target.prototype[symbol] = Mixin.prototype[symbol as any]
  }
  for (const name of Object.getOwnPropertyNames(Mixin)) {
    if (['name', 'prototype', 'length'].includes(name)) { continue }
    Target[name] = Mixin[name]
  }
  for (const symbol of Object.getOwnPropertySymbols(Mixin)) {
    Target[symbol] = Mixin[symbol as any]
  }
}

function registerHooks(Target: any, Mixin: AnyMixin) {
  const mixinHooks = getHooks(Mixin)
  if (mixinHooks == null) { return }

  for (const [name, hooks] of Object.entries(mixinHooks)) {
    for (const hook of hooks) {
      registerHook(Target, name as any, hook)
    }
  }
}

export type Constructor<T> = new (...args: any[]) => T
export type Mixin<I, S> = S & {prototype: I}
export type AnyMixin = Mixin<any, any>
declare type MixinInstance<T extends AnyMixin | Constructor<any>> =
  T extends {prototype: infer I} ? I :
  T extends Constructor<infer I> ? I :
  never

declare type MixinStatics<T extends AnyMixin | Constructor<any>> =
  Omit<T, 'new' | 'constructor'>
