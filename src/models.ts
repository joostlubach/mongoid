import Model from './Model'
import { ModelClass } from './typings'

const models: {[name: string]: ModelClass<any>} = {}
export default models

export function register<M extends Model>(Class: Function) {
  const ModelClass = Class as ModelClass<M>
  if (!(ModelClass.prototype instanceof Model)) {
    throw new Error(`${Class.name} cannot be registered as a model class`)
  }

  models[ModelClass.name] = ModelClass
}