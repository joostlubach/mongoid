import { ValidatorResult } from 'validator'
import { TypedMethodDecorator } from 'ytil'
import ModelBackend from './backend/ModelBackend'
import Model from './Model'
import { ModelClass } from './typings'

const HOOKS: WeakMap<any, Hooks<any>> = new Map()

interface Hooks<M extends Model> {
  beforeValidate: Set<BeforeValidateHook<M>>
  validate:       Set<ValidateHook<M>>
  beforeSave:     Set<BeforeSaveHook<M>>
  afterSave:      Set<AfterSaveHook<M>>
  beforeDelete:   Set<BeforeDeleteHook<M>>
  afterDelete:    Set<AfterDeleteHook<M>>
}

type Hook<M extends Model> =
  | BeforeValidateHook<M>
  | ValidateHook<M>
  | BeforeSaveHook<M>
  | AfterSaveHook<M>
  | BeforeDeleteHook<M>
  | AfterDeleteHook<M>

export type BeforeValidateHook<M extends Model> = (this: M,) => any | Promise<any>
export type ValidateHook<M extends Model>       = (this: M, result: ValidatorResult<M>,) => any | Promise<any>
export type BeforeSaveHook<M extends Model>     = (this: M, backend: ModelBackend<M>,) => any | Promise<any>
export type AfterSaveHook<M extends Model>      = (this: M, backend: ModelBackend<M>, wasNew: boolean) => any | Promise<any>
export type BeforeDeleteHook<M extends Model>   = (this: M, backend: ModelBackend<M>, ) => any | Promise<any>
export type AfterDeleteHook<M extends Model>    = (this: M, backend: ModelBackend<M>, ) => any | Promise<any>

export type HookName = keyof Hooks<any>
export type HookArgs<M extends Model, H extends HookName> = Hooks<M>[H] extends (Set<(...args: infer A) => any>) ? A : never
export type HookFn<M extends Model, H extends HookName> = (this: M, ...args: HookArgs<M, H>) => any | Promise<any>
export type RegisterHookFn = <M extends Model, H extends HookName>(Model: ModelClass<M>, name: H, hook: HookFn<M, H>) => void
export type CallHookFn = <M extends Model, H extends HookName>(model: M, name: H, ...args: HookArgs<M, H>) => Promise<boolean>

export const registerHook: RegisterHookFn = <M extends Model, H extends HookName>(Model: ModelClass<M>, name: H, hook: HookFn<M, H>) => {
  let hooksForModel = HOOKS.get(Model)
  if (hooksForModel == null) {
    HOOKS.set(Model, hooksForModel = {
      beforeValidate: new Set(),
      validate:       new Set(),
      beforeSave:     new Set(),
      afterSave:      new Set(),
      beforeDelete:   new Set(),
      afterDelete:    new Set(),
    })
  }

  const hooks = hooksForModel[name]
  hooks.add(hook as any)
}

export const callHook: CallHookFn = async <M extends Model, H extends HookName>(model: M, name: H, ...args: HookArgs<M, H>) => {
  const hooks = resolveHooks(model.ModelClass, name)
  for (const hook of hooks) {
    await (hook as any).call(model, ...args)
  }
  return hooks.length > 0
}

export function getHooks<M extends Model>(Model: ModelClass<M>): Hooks<M> | null {
  return HOOKS.get(Model) ?? null
}

export function resolveHooks<M extends Model>(Model: ModelClass<M>, name: HookName): Hook<M>[] {
  if (!(Model.prototype instanceof Model)) { return [] }

  const superPrototype = Object.getPrototypeOf(Model.prototype)
  const SuperClass     = superPrototype && superPrototype.constructor

  const hooksForClass = HOOKS.get(Model)
  if (hooksForClass == null) {
    return resolveHooks(SuperClass, name)
  } else {
    return [...hooksForClass[name], ...resolveHooks(SuperClass, name)]
  }
}

// Decorator
export function hook<H extends HookName, F extends HookFn<any, H>>(name: H): TypedMethodDecorator<F> {
  return (target, key, descriptor) => {
    if (descriptor.value == null) { return }
    if (!(target instanceof Model)) {
      throw new Error(`@hook() can only be used on methods of a Model`)
    }

    registerHook(target.meta.Model, name, descriptor.value)
  }
}