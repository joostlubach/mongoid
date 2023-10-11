import { MongoClient } from 'mongodb'
import { testClient } from './client'

describe("client", () => {

  let client: MongoClient

  beforeEach(async () => {
    client = await testClient()
  })

  test("test client", () => {
    expect(client).toBeDefined()
    expect(client.db().databaseName).toMatch(/mongoid:test-[a-z0-9]+/)
  })

  test("server version should be >= 6.0.0", async () => {
    const serverVersion = await client.db().admin().serverInfo()
    expect(serverVersion.version).toMatch(/6\.\d+\.\d+/)
  })

})