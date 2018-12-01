import Model from './Model'
import {Modifications, ModelClass, ID} from './typings'
import {mapValues, isEqual} from 'lodash'

export type ChangeType = 'create' | 'update' | 'delete'

export default class Change<M extends Model> {

  constructor(
    readonly Model:         ModelClass<M>,
    readonly id:            ID,
    readonly modifications: Modifications<M>
  ) {}

  static fromModel<M extends Model>(model: M, deleted: boolean = false): Change<M> {
    if (model.id == null) {
      throw new TypeError("Model not saved")
    }

    const oldAttributes = (model.originals || {}) as Partial<M>
    const newAttributes = deleted ? {} : model.meta.getAttributes(model, false)
    const modifications = deriveModifications<M>(oldAttributes, newAttributes)

    return new Change(model.constructor as ModelClass<M>, model.id, modifications)
  }

  get oldAttributes(): Partial<M> {
    return mapValues(this.modifications, mod => mod.oldValue) as any as Partial<M>
  }

  get newAttributes(): Partial<M> {
    return mapValues(this.modifications, mod => mod.newValue) as any as Partial<M>
  }

  get type(): ChangeType {
    const idModification = this.modifications.id
    if (idModification == null) { return 'update' }
    if (idModification.oldValue == null) { return 'create' }
    if (idModification.newValue == null) { return 'delete' }
    return 'update'
  }

  modified(attribute: string) {
    return attribute in this.modifications
  }

}

function deriveModifications<M extends Model>(oldAttributes: Partial<M>, newAttributes: Partial<M>): Modifications<M> {
  const allNames = new Set()
  for (const name of Object.keys(oldAttributes)) {
    allNames.add(name)
  }
  for (const name of Object.keys(newAttributes)) {
    allNames.add(name)
  }

  // TODO: Deep derivation?
  const modifications: any = {}
  for (const name of allNames) {
    const oldValue = (oldAttributes as any)[name]
    const newValue = (newAttributes as any)[name]
    if (isEqual(oldValue, newValue)) { continue }

    modifications[name] = {oldValue, newValue}
  }
  return modifications
}