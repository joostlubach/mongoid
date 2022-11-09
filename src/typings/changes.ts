import Model from '../Model'
import Change from '../Change'

export type ChangeListener<M extends Model> = (model: M, change: Change<M>) => void | Promise<void>

export type Modifications<M extends Model> = {
  [path in keyof M]: {
    prevValue: M[path]
    nextValue: M[path]
  }
}