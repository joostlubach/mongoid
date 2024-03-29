import { Collection, MongoClient, ObjectId } from 'mongodb'
import { ID } from 'typings'

import { ModelBackend } from '../backend/index.js'
import { configure } from '../config.js'
import { testClient } from './client.js'
import { Parent } from './datamodel.js'

describe("ID", () => {
  let parent: Parent
  let client: MongoClient
  let backend: ModelBackend<Parent>

  beforeEach(async () => {
    parent = new Parent()
    client = await testClient()
    backend = new ModelBackend(client, Parent)
  })

  describe("ID generators", () => {
    beforeEach(() => {
      parent.meta.config.idGenerator = customIdGenerator
    })

    afterEach(() => {
      parent.meta.config.idGenerator = undefined
    })

    test("default ID is ObjectId", async () => {
      parent.meta.config.idGenerator = undefined
      const id = await parent.meta.generateID(parent)
      expect(id).toBeInstanceOf(ObjectId)
    })

    test("ID generator usage", async () => {
      const id = await parent.meta.generateID(parent)
      expect(id).toEqual('foo')
    })

    test("default ID generator", async () => {
      parent.meta.config.idGenerator = undefined
      configure({idGenerator: customIdGenerator})
      const id = await parent.meta.generateID(parent)

      expect(parent.meta.config.idGenerator).toBeUndefined()
      expect(id).toBe('foo')
    })

    test("usage in `ensureID()`", async () => {
      const parent = new Parent()
      await parent.ensureID()
      expect(parent.id).toEqual('foo')
    })

    test("usage when saving a new model", async () => {
      const spy = jest.spyOn(Collection.prototype, 'insertOne')

      const parent = new Parent({name: "Parent 1"})
      await backend.save(parent)

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'foo',
      }), expect.anything())
    })
  })

  describe("ID adapters", () => {
    beforeEach(() => {
      parent.meta.config.idGenerator = customIdGenerator
      parent.meta.config.idAdapter = customIdAdapter
    })

    afterEach(() => {
      parent.meta.config.idGenerator = undefined
      parent.meta.config.idAdapter = undefined
    })

    test("ID adapter", async () => {
      const toMongo = parent.meta.idToMongo('foo')
      const fromMongo = parent.meta.idFromMongo('FOO')

      expect(toMongo).toEqual('FOO')
      expect(fromMongo).toEqual('foo')
    })

    test("config fallback", async () => {
      parent.meta.config.idGenerator = undefined
      parent.meta.config.idAdapter = undefined

      configure({
        idGenerator: customIdGenerator,
        idAdapter:   customIdAdapter,
      })

      const id = await parent.meta.generateID(parent)
      const toMongo = parent.meta.idToMongo('bar')
      const fromMongo = parent.meta.idFromMongo('BAR')

      expect(parent.meta.config.idAdapter).toBeUndefined()
      expect(toMongo).toEqual('BAR')
      expect(fromMongo).toEqual('bar')
    })

    test("`idToMongo` when building a query cursor", async () => {
      const spy = jest.spyOn(Collection.prototype, 'find')

      const query = Parent.filter({id: 'foo'})
      await backend.query(query).find()

      expect(spy).toHaveBeenCalledWith(
        {$and: [{_id: 'FOO'}]},
      )
    })

    test.todo("`idFromMongo` when using `QueryExecutor#pluck`")

    test.todo("`idFromMongo` when using `Aggegration#pluck`")

    test.todo("`idFromMongo` when hydrating a model")

    test("`idToMongo` when inserting a model document", async () => {
      const spy = jest.spyOn(Collection.prototype, 'insertOne')

      const parent = new Parent({id: 'foo', name: "Parent 1"})
      await backend.save(parent)

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({_id: 'FOO'}),
        expect.anything(),
      )
    })

    test("`idToMongo` when updating a model document", async () => {
      const spy = jest.spyOn(Collection.prototype, 'updateOne')

      const parent = await backend.create({id: 'foo', name: "Parent 1"})
      parent.name = "Parent 2"
      await backend.save(parent)

      expect(spy).toHaveBeenCalledWith(
        {_id: 'FOO'},
        expect.anything(),
        expect.anything(),
      )
    })
  })
})

const customIdGenerator = () => 'foo'
const customIdAdapter = {
  toMongo:   (id: string) => id.toUpperCase(),
  fromMongo: (id: ID) => id.toString().toLowerCase(),
}
