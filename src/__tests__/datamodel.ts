import { model, TypedModel } from '../'
import { array, number, ref, string } from '../types'

const parentSchema = {
  name: string(),
  age:  number({required: false}),
  children: array({
    itemType: ref({model: 'Child'}),
    default:  () => []
  })
}

@model<Parent>('Parent', {schema: parentSchema})
export class Parent extends TypedModel(parentSchema) {
}