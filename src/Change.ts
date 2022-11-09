import Model from './Model'
import { Modifications, ModelClass, ID } from './typings'
import { mapValues, isEqual } from 'lodash'

export type ChangeType = 'create' | 'update' | 'delete'

export default class Change<M extends Model> {

  constructor(
    public readonly type:          ChangeType,
    public readonly Model:         ModelClass<M>,
    public readonly id:            ID,
    public readonly modifications: Modifications<M>
  ) {}

  public static fromModel<M extends Model>(model: M, type: ChangeType): Change<M> {
    if (model.id == null) {
      throw new TypeError("Model not saved")
    }

    const prevAttributes = (model.originals || {}) as Partial<M>
    const nextAttributes = type === 'delete' ? {} : model.meta.getAttributes(model, false)
    const modifications = deriveModifications<M>(prevAttributes, nextAttributes)

    return new Change(type, model.constructor as ModelClass<M>, model.id, modifications)
  }

  public get prevAttributes(): Partial<M> {
    return mapValues(this.modifications, mod => mod.prevValue) as any as Partial<M>
  }

  public get nextAttributes(): Partial<M> {
    return mapValues(this.modifications, mod => mod.nextValue) as any as Partial<M>
  }

  public modified(attribute: string) {
    return attribute in this.modifications
  }

}

function deriveModifications<M extends Model>(prevAttributes: Partial<M>, nextAttributes: Partial<M>): Modifications<M> {
  const allNames: Set<string> = new Set()
  for (const name of Object.keys(prevAttributes)) {
    allNames.add(name)
  }
  for (const name of Object.keys(nextAttributes)) {
    allNames.add(name)
  }

  // TODO: Deep derivation?
  const modifications: any = {}
  for (const name of allNames) {
    const prevValue = (prevAttributes as any)[name]
    const nextValue = (nextAttributes as any)[name]
    if (isEqual(prevValue, nextValue)) { continue }

    modifications[name] = {prevValue, nextValue}
  }
  return modifications
}