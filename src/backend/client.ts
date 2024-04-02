import { MongoClient } from 'mongodb'

import config from '../config.js'

export async function connect(uri: string) {
  const client = await MongoClient.connect(uri, config.connect)
  return client
}
