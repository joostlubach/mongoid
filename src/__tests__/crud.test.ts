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
      job:         null,
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

describe("ensure", () => {

  it("should create a document in the database if it didn't exist yet", async () => {
    await backend.ensure({name: "Parent 1"})

    const document = await client.db().collection('parents').findOne({})
    expect(document).toEqual({
      _id:         expect.anything(),
      name:        "Parent 1",
      age:         null,
      job:         null,
      children:    [],
      createdAt:   expect.any(Date),
      updatedAt:   expect.any(Date),
      _references: [],
    })
  })

  it("should return the created model and populate some default properties", async () => {
    const parent = await backend.ensure({name: "Parent 1"})
    expect(parent).toEqual(expect.objectContaining({
      id:        expect.anything(),
      name:      "Parent 1",
      age:       null,
      job:       null,
      children:  [],
      createdAt: expect.any(DateTime),
      updatedAt: expect.any(DateTime),
    }))
  })

  it("should re-use an existing model if it existed in the database", async () => {
    const existing = await backend.create({name: "Parent 1"})
    const parent = await backend.ensure({name: "Parent 1"})
    expect(parent.id).toEqual(existing.id)
  })

  it("should allow setting new properties in one go", async () => {
    const existing = await backend.create({name: "Parent 1"})

    const parent = await backend.ensure({
      name: "Parent 1",
    }, {}, {
      age: 40,
    })

    const fresh = await backend.query().get(existing.id)
    expect(parent.age).toEqual(40)
    expect(fresh?.age).toEqual(40)
  })

  it("should allow setting default properties that are only applied if the model was created", async () => {
    const existing = await backend.create({
      name: "Parent 1",
      job:  "Mechanic",
    })

    const parent = await backend.ensure({
      name: "Parent 1",
    }, {
      job: "Waiter",
    }, {
      age: 40,
    })

    const fresh = await backend.query().get(existing.id)
    expect(parent.job).toEqual("Mechanic")
    expect(parent.age).toEqual(40)
    expect(fresh?.job).toEqual("Mechanic")
    expect(fresh?.age).toEqual(40)
  })

})