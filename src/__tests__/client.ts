import { MongoClient } from 'mongodb'
import { testSeed } from 'yest'
import { slugify, TextAnchor, truncate } from 'ytil'

let _client: MongoClient | undefined

export async function testClient() {
  if (_client != null) { return _client }

  const dbName = deriveDatabaseName()
  const url = (process.env.MONGODB_URL ?? `mongodb://localhost:27017`) + `/${dbName}`
  _client = new MongoClient(url)
  await _client.connect()

  return _client
}

afterEach(async () => {
  await _client?.db().dropDatabase()
  await _client?.close()
  _client = undefined
})

function deriveDatabaseName() {
  const prefix = process.env.DB_PREFIX ?? `mongoid-test-`
  const seed = slugify(testSeed(expect.getState().currentTestName))
  const suffix = truncate(seed, 36 - prefix.length, {anchor: TextAnchor.End, ellipsis: ''})
  return `${prefix}${suffix}`
}