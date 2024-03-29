import { MongoClient } from 'mongodb'

import { testClient } from './client.js'

describe("client", () => {
  let client: MongoClient

  beforeEach(async () => {
    client = await testClient()
  })

  test("test client", () => {
    expect(client).toBeDefined()

    // The name is mongoid-test-<full-test-name>, in this case `mongoid-test-client-test-client`.
    expect(client.db().databaseName).toMatch(/mongoid-test-client-test-client/)
  })

  test("server version should be >= 6.0.0", async () => {
    const serverVersion = await client.db().admin().serverInfo()
    expect(serverVersion.version).toMatch(/6\.\d+\.\d+/)
  })
})
