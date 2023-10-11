import { model } from '../registry'
import { array, number, ref, string } from '../types'
import { TypedModel } from '../typings'

const parentSchema = {
  name: string(),
  age:  number({required: false}),
  children: array({
    itemType: ref({model: 'Child'}),
    default:  () => []
  })
}

const childSchema = {
  name:   string(),
  age:    number({required: false}),
  parent: ref<Parent>({model: 'Parent'}),
  siblings: array({
    itemType: ref({model: 'Child'}),
    default:  () => []
  })
}

const petSchema = {
  name:   string(),
  age:    number({required: false}),
  parent: ref<Parent>({model: 'Parent'}),
}

@model<Parent>('Parent', {schema: parentSchema})
export class Parent extends TypedModel(parentSchema) {
}

@model<Child>('Child', {schema: childSchema})
export class Child extends TypedModel(childSchema) {
}

@model<Pet>('Pet', {schema: petSchema})
export class Pet extends TypedModel(petSchema) {
}