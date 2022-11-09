import { ID } from './typings'
import { ObjectId } from 'mongodb'

export function isID(value: any): value is ID {
  if (typeof value === 'number') { return true }
  if (typeof value === 'string') { return true }
  if (ObjectId.isValid(value)) { return true }

  return false
}