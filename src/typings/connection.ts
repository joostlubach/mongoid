import {ObjectID, DeleteWriteOpResultObject, UpdateWriteOpResult} from 'mongodb'

export interface Config {
  host:      string
  port:      number
  db:        string
  user?:     string
  password?: string
  timeout?:  number
  ssl?:      AnyObject

  createDatabase?: boolean
}

export {ObjectID, DeleteWriteOpResultObject, UpdateWriteOpResult}