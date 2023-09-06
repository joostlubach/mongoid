import chalk from 'chalk'
import { Db, MongoClient } from 'mongodb'
import URL from 'url'
import config from '../config'

const stub = new Proxy({}, {
  get() {
    throw new Error(`No connection made yet`)
  },
})

let CLIENT: MongoClient = stub as MongoClient
let DB: Db = stub as Db

export function db(): Db {
  if (DB == null) {
    throw new Error("Not yet connected")
  }
  return DB
}

export function getClient(): MongoClient {
  if (CLIENT == null) {
    throw new Error("Not yet connected")
  }
  return CLIENT
}

export async function connect(uri: string) {
  const client = await (MongoClient as any).connect(uri, {
    useUnifiedTopology: true,
  })

  const url = URL.parse(uri)
  const dbName = url.pathname?.slice(1)
  if (dbName == null) {
    config.logger.warn(chalk`{yellow △} No database name found in ${uri}`)
  }

  CLIENT = client
  DB = client.db(dbName)

  config.logger.info(chalk`{green √} Connected to ${uri}`)
}

export function disconnect() {
  CLIENT.close()
  config.logger.debug(chalk`{red ◼︎} Connection closed`)
}

export function connected() {
  return CLIENT !== stub && DB !== stub
}