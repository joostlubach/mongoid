import Model from './Model'

const HOOKS: WeakMap<any, Hooks> = new Map()

export interface Hooks {
  beforeValidate: Set<BeforeValidateHook>
  beforeSave:     Set<BeforeSaveHook>
  afterSave:      Set<AfterSaveHook>
  beforeDelete:   Set<BeforeDeleteHook>
  afterDelete:    Set<AfterDeleteHook>
}

export type HookName = keyof Hooks
export type Hook =
  | BeforeValidateHook
  | BeforeSaveHook
  | AfterSaveHook
  | BeforeDeleteHook
  | AfterDeleteHook

export type BeforeValidateHook = (isNew: boolean) => any | Promise<any>
export type BeforeSaveHook     = (isNew: boolean) => any | Promise<any>
export type AfterSaveHook      = (isNew: boolean) => any | Promise<any>
export type BeforeDeleteHook   = () => any | Promise<any>
export type AfterDeleteHook    = () => any | Promise<any>

export function registerHook(Model: any, name: 'beforeValidate', hook: BeforeValidateHook): void
export function registerHook(Model: any, name: 'beforeSave', hook: BeforeSaveHook): void
export function registerHook(Model: any, name: 'afterSave', hook: AfterSaveHook): void
export function registerHook(Model: any, name: 'beforeDelete', hook: BeforeDeleteHook): void
export function registerHook(Model: any, name: 'afterDelete', hook: AfterDeleteHook): void
export function registerHook(Model: any, name: HookName, hook: Hook): void
export function registerHook(Model: any, name: HookName, hook: Hook) {
  let hooksForModel = HOOKS.get(Model)
  if (hooksForModel == null) {
    HOOKS.set(Model, hooksForModel = {
      beforeValidate: new Set(),
      beforeSave:     new Set(),
      afterSave:      new Set(),
      beforeDelete:   new Set(),
      afterDelete:    new Set(),
    })
  }

  const hooks = hooksForModel[name] as Set<Hook>
  hooks.add(hook)
}

export async function callHook(model: Model, name: 'beforeValidate'): Promise<boolean>
export async function callHook(model: Model, name: 'beforeSave', isNew: boolean): Promise<boolean>
export async function callHook(model: Model, name: 'afterSave', isNew: boolean): Promise<boolean>
export async function callHook(model: Model, name: 'beforeDelete'): Promise<boolean>
export async function callHook(model: Model, name: 'afterDelete'): Promise<boolean>
export async function callHook(model: Model, name: HookName, ...args: any[]): Promise<boolean>
export async function callHook(model: Model, name: HookName, ...args: any[]) {
  const Model = model.constructor as any
  const hooks = resolveHooks(Model, name)

  for (const hook of hooks) {
    await (hook as any).call(model, ...args)
  }
  return hooks.length > 0
}

export function getHooks(Class: any): Hooks | null {
  return HOOKS.get(Class) ?? null
}

export function resolveHooks(Class: any, name: HookName): Hook[] {
  if (!(Class.prototype instanceof Model)) { return [] }

  const superPrototype = Object.getPrototypeOf(Class.prototype)
  const SuperClass     = superPrototype && superPrototype.constructor

  const hooksForClass = HOOKS.get(Class)
  if (hooksForClass == null) {
    return resolveHooks(SuperClass, name)
  } else {
    return [...hooksForClass[name], ...resolveHooks(SuperClass, name)]
  }
}

// Decorator
export function hook(name: HookName) {
  return (target: Object, context: ClassMethodDecoratorContext) => {
    if (!(target instanceof Model)) {
      throw new Error(`@hook() can only be used on methods of a Model`)
    }

    const prototype = target as any
    const key       = context.name
    registerHook(target.meta.Model, name, prototype[key] as Hook)
  }
}