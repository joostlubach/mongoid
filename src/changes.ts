import Change from './Change'
import Model from './Model'
import { ChangeListener, ModelClass } from './typings'

const changeListeners: WeakMap<Record<string, any>, Set<ChangeListener<any>>> = new WeakMap()

//------
// Listener registration

function addListener(listener: ChangeListener<Model>): void
function addListener<M extends Model>(Model: ModelClass<M>, listener: ChangeListener<M>): void
function addListener(...args: any[]) {
  let ModelClass = Model
  let listener: ChangeListener<any>
  if (args.length === 1) {
    listener = args[0]
  } else {
    ModelClass = args[0]
    listener = args[1]
  }

  let listeners = changeListeners.get(ModelClass)
  if (listeners == null) {
    changeListeners.set(ModelClass, listeners = new Set())
  }

  listeners.add(listener)
}

function removeListener(listener: ChangeListener<Model>): void
function removeListener<M extends Model>(Model: ModelClass<M>, listener: ChangeListener<M>): void
function removeListener(...args: any[]) {
  let ModelClass = Model
  let listener: ChangeListener<any>
  if (args.length === 1) {
    listener = args[0]
  } else {
    ModelClass = args[0]
    listener = args[1]
  }

  const listeners = changeListeners.get(ModelClass)
  if (listeners == null) { return }
  listeners.delete(listener)
}

export {addListener, removeListener}

//------
// Emit change

export function emitCreate(model: Model) {
  const listeners = resolveChangeListeners(model.constructor as ModelClass<any>)
  if (listeners.length === 0) { return }

  const change = Change.fromModel(model, 'create')
  listeners.forEach(listener => listener(model, change))
}

export function emitUpdate(model: Model) {
  const listeners = resolveChangeListeners(model.constructor as ModelClass<any>)
  if (listeners.length === 0) { return }

  const change = Change.fromModel(model, 'update')
  listeners.forEach(listener => listener(model, change))
}

export function emitDelete(model: Model) {
  const listeners = resolveChangeListeners(model.constructor as ModelClass<any>)
  if (listeners.length === 0) { return }

  const change = Change.fromModel(model, 'delete')
  listeners.forEach(listener => listener(model, change))
}

function getOwnChangeListeners<M extends Model>(Model: ModelClass<M>): Array<ChangeListener<M>> {
  const listeners = changeListeners.get(Model)

  if (listeners == null) { return [] }
  return Array.from(listeners)
}

function resolveChangeListeners<M extends Model>(ModelClass: ModelClass<M>): Array<ChangeListener<M>> {
  const listeners = getOwnChangeListeners(ModelClass)
  if ((ModelClass as any) === Model || (ModelClass as any) === Object) { return listeners }

  const Super = (ModelClass as any).__proto__
  if (Super == null) { return listeners }

  return [...listeners, ...resolveChangeListeners(Super)]
}