import Model from './Model'
import Change from './Change'
import {ModelClass, ChangeListener} from './typings'

const changeListeners: WeakMap<Function, Set<ChangeListener<any>>> = new WeakMap()

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

  let listeners = changeListeners.get(ModelClass)
  if (listeners == null) { return }
  listeners.delete(listener)
}

export {addListener, removeListener}

//------
// Emit change

export function emitChange(model: Model) {
  const listeners = resolveChangeListeners(model.constructor as ModelClass<any>)
  if (listeners.length === 0) { return }

  const change = Change.fromModel(model)
  listeners.forEach(listener => listener(model, change))
}

export function emitDelete(model: Model) {
  const listeners = resolveChangeListeners(model.constructor as ModelClass<any>)
  if (listeners.length === 0) { return }

  const change = Change.fromModel(model, true)
  listeners.forEach(listener => listener(model, change))
}

function getOwnChangeListeners<M extends Model>(Model: ModelClass<M>): ChangeListener<M>[] {
  const listeners = changeListeners.get(Model)
  if (listeners == null) { return [] }
  return Array.from(listeners)
}

function resolveChangeListeners<M extends Model>(ModelClass: ModelClass<M>): ChangeListener<M>[] {
  const listeners = getOwnChangeListeners(Model)
  if (ModelClass === Model || (ModelClass as any) === Object) { return listeners }

  const Super = (ModelClass as any).__proto__
  if (Super == null) { return listeners }

  return [...listeners, ...resolveChangeListeners(Super)]
}