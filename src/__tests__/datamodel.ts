import { model } from '../registry.js'
import { array, number, string } from '../types.js'
import { ref } from '../types/ref.js'
import { TypedModel } from '../typings.js'

const parentSchema = {
  name:     string(),
  age:      number({required: false}),
  children: array({
    itemType: ref({model: 'Child'}),
    default:  () => [],
  }),
}

const childSchema = {
  name:     string(),
  age:      number({required: false}),
  parent:   ref<Parent>({model: 'Parent'}),
  siblings: array({
    itemType: ref({model: 'Child'}),
    default:  () => [],
  }),
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
