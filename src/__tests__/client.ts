import { MongoClient } from 'mongodb'
import { testSeed } from 'yest'

const CLIENTS = new Map<string, MongoClient>()

export async function testClient() {
  const seed     = testSeed()
  const existing = CLIENTS.get(seed)
  if (existing != null) { return existing }

  const dbName = process.env.MONGODB_DBNAME ?? `mongoid:test-${seed}`
  const url    = process.env.MONGODB_URL ?? `mongodb://localhost:27017/${dbName}`
  const client = new MongoClient(url)
  await client.connect()

  CLIENTS.set(seed, client)
  console.log([...CLIENTS.keys()])
  return client
}

afterEach(async () => {
  const seed   = testSeed()
  const client = CLIENTS.get(seed)
  await client?.db().dropDatabase()
  await client?.close()
  CLIENTS.delete(seed)
})

