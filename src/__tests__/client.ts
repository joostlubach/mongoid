import { MongoClient } from 'mongodb'
import { testSeed } from 'yest'

let _client: MongoClient | undefined

export async function testClient() {
  if (_client != null) { return _client }

  const seed   = testSeed()
  const dbName = process.env.MONGODB_DBNAME ?? `mongoid:test-${seed}`
  const url    = process.env.MONGODB_URL ?? `mongodb://localhost:27017/${dbName}`
  _client = new MongoClient(url)
  await _client.connect()

  return _client
}

afterEach(async () => {
  await _client?.db().dropDatabase()
  await _client?.close()
  _client = undefined
})

beforeAll(async () => {
  if (process.env.DROP_TEST_DBS) {
    await dropTestDatabases()
  }
})

async function dropTestDatabases() {
  const client = new MongoClient('mongodb://localhost:27017')
  await client.connect()

  const dbs      = await client.db().admin().listDatabases()
  const prefix   = 'mongoid:test-'
  const names    = dbs.databases.filter(db => db.name.startsWith(prefix)).map(db => db.name)
  const promises = names.map(it => client.db(it).dropDatabase())
  await Promise.all(promises)

  await client.close()
}