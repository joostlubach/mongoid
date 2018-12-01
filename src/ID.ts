import {ObjectID} from 'mongodb'

export function isID(value: any) {
  if (typeof value === 'number') { return true }
  if (typeof value === 'string') { return true }
  if (value instanceof ObjectID) { return true }

  return false
}