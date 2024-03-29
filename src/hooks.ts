import { isFunction } from 'lodash'
import { ValidatorResult } from 'validator'
import { NestedWeakMap, TypedMethodDecorator } from 'ytil'

import Model from './Model'
import ModelBackend from './backend/ModelBackend'
import { ModelClass } from './typings'

const HOOKS = new NestedWeakMap<[ModelClass<any>, HookName], Set<string | symbol>>()

export type HookName = keyof HookFunctions
export type HookFunctions = StaticHookFunctions & InstanceHookFunctions

export type StaticHookFunctions = {
  initialize: InitializeHook<any>
}

export type InstanceHookFunctions = {
  beforeValidate: BeforeValidateHook<any>
  validate:       ValidateHook<any>
  beforeSave:     BeforeSaveHook<any>
  afterSave:      AfterSaveHook<any>
  beforeDelete:   BeforeDeleteHook<any>
  afterDelete:    AfterDeleteHook<any>
}

export type InitializeHook<M extends Model> = (this: ModelClass<M>, backend: ModelBackend<M>) => any | Promise<any>
export type BeforeValidateHook<M extends Model> = (this: M,) => any | Promise<any>
export type ValidateHook<M extends Model> = (this: M, result: ValidatorResult<M>,) => any | Promise<any>
export type BeforeSaveHook<M extends Model> = (this: M, backend: ModelBackend<M>,) => any | Promise<any>
export type AfterSaveHook<M extends Model> = (this: M, backend: ModelBackend<M>, created: boolean) => any | Promise<any>
export type BeforeDeleteHook<M extends Model> = (this: M, backend: ModelBackend<M>,) => any | Promise<any>
export type AfterDeleteHook<M extends Model> = (this: M, backend: ModelBackend<M>,) => any | Promise<any>

/**
 * Marks a method as a hook.
 * @param name The (well known) name of the hook.
 */
export function hook<H extends HookName>(name: H): TypedMethodDecorator<HookFunctions[H]> {
  if (name === 'initialize') {
    return (target, key) => {
      // Applies to static methods.
      if (!isFunction(target) || !(target.prototype instanceof Model)) {
        throw new Error(`@hook('initialize') can only be used on static methods of a Model`)
      }

      const Class = target as any as ModelClass<any>
      const hooks = HOOKS.ensure(Class, name, () => new Set())
      hooks.add(key)
    }
  } else {
    return (target, key) => {
      if (!(target instanceof Model)) {
        throw new Error(`@hook(...) can only be used on methods of a Model (except 'initialize')`)
      }

      const hooks = HOOKS.ensure(target.ModelClass, name, () => new Set())
      hooks.add(key)
    }
  }
}

export async function callStaticHook<M extends Model, H extends keyof StaticHookFunctions>(Model: ModelClass<M>, name: H, ...args: Parameters<HookFunctions[H]>): Promise<boolean> {
  const keys = resolveHooks(Model, name)
  let found = false

  const promises = keys.map(async key => {
    const method = (Model as any)[key]
    if (!isFunction(method)) { return }

    found = true
    await method.call(Model, ...args)
  })
  await Promise.all(promises)

  return found
}

export async function callInstanceHook<M extends Model, H extends keyof InstanceHookFunctions>(model: M, name: H, ...args: Parameters<HookFunctions[H]>): Promise<boolean> {
  const keys = resolveHooks(model.ModelClass, name)
  let found = false

  const promises = keys.map(async key => {
    const method = (model as any)[key]
    if (!isFunction(method)) { return }

    found = true
    await method.call(model, ...args)
  })
  await Promise.all(promises)

  return found
}

export function resolveHooks<M extends Model, H extends HookName>(Model: ModelClass<M>, name: H): Array<string | symbol> {
  const superPrototype = Object.getPrototypeOf(Model.prototype)
  const SuperClass = superPrototype && superPrototype.constructor

  return [
    ...Array.from(HOOKS.get(Model, name) ?? []),
    ...SuperClass ? resolveHooks(SuperClass, name) : [],
  ]
}
