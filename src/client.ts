import {MongoClient, Db} from 'mongodb'
import config from './config'
import URL from 'url'

const stub = new Proxy({}, {
  get() {
    throw new Error(`No connection made yet`)
  }
})

let CLIENT: MongoClient = stub as MongoClient
let DB: Db = stub as Db

export default function(): Db {
  if (DB == null) {
    throw new Error("Not yet connected")
  }
  return DB
}

export function connect(uri: string) {
  return new Promise((resolve, reject) => {
    MongoClient.connect(uri, (error, client) => {
      if (error != null) {
        reject(error)
        return
      }

      const url = URL.parse(uri)
      const dbName = url.pathname!.slice(1)

      CLIENT = client
      DB = client.db(dbName)

      config.logger.info(`Connected to ${uri}`)
      resolve()
    })
  })
}

export function disconnect() {
  CLIENT.close()
  config.logger.info("Connection closed")
}