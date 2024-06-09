import { MongoClient } from 'mongodb'

export default async function teardown() {
  const url = process.env.MONGODB_URL ?? `mongodb://localhost:27017`
  const client = new MongoClient(url)
  await client.connect()

  try {
    const dbs = await client.db().admin().listDatabases()
    const prefix = 'mongoid-test-'
    const names = dbs.databases.filter(db => db.name.startsWith(prefix)).map(db => db.name)
    const promises = names.map(it => client.db(it).dropDatabase())
    await Promise.all(promises)
  } finally {
    try { await client.close() }
    catch { /* ignore */ }
  }
}