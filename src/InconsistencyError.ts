import Model from './Model'
import { ModelClass } from './typings'

export default class InconsistencyError<M extends Model> extends Error {

  constructor(Model: ModelClass<M>, message: string) {
    super(`Inconsistent model \`${Model.name}\`: ${message}`)

    this.Model = Model
  }

  public readonly Model:  ModelClass<M>

  public toJSON() {
    return {
      message: this.message,
    }
  }

}