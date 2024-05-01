import { DateTime } from 'luxon'

import { ModelBackend, MongoClient } from '../backend'
import { testClient } from './client'
import { Parent } from './datamodel/family'

let backend: ModelBackend<Parent>
let client: MongoClient

beforeEach(async () => {
  client = await testClient()
  backend = new ModelBackend(client, Parent)
})

describe("create", () => {

  it("should create a document in the database", async () => {
    await backend.create({name: "Parent 1"})

    const document = await client.db().collection('parents').findOne({})
    expect(document).toEqual({
      _id:         expect.anything(),
      name:        "Parent 1",
      age:         null,
      children:    [],
      createdAt:   expect.any(Date),
      updatedAt:   expect.any(Date),
      _references: [],
    })
  })

  it("should return the created model and populate some default properties", async () => {
    const parent = await backend.create({name: "Parent 1"})
    expect(parent).toEqual(expect.objectContaining({
      id:        expect.anything(),
      name:      "Parent 1",
      age:       null,
      children:  [],
      createdAt: expect.any(DateTime),
      updatedAt: expect.any(DateTime),
    }))
  })

})