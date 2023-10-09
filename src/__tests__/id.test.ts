import { MongoClient, ObjectId } from 'mongodb'
import { ID } from 'typings'
import { ModelBackend } from '../backend'
import { configure } from '../config'
import { Parent } from './datamodel'
import { mockClient, MockCollection, MockCursor } from './mocks'

describe("ID", () => {

  let parent: Parent
  let client: MongoClient
  let backend: ModelBackend<Parent>

  beforeEach(() => {
    parent  = new Parent()
    client  = mockClient()
    backend = new ModelBackend(client, Parent)
  })

  describe("ID generators", () => {

    beforeEach(() => {
      parent.meta.config.idGenerator = customIdGenerator
    })

    afterEach(() => {
      parent.meta.config.idGenerator = undefined
    })

    it("should use Object IDs by default", async () => {
      parent.meta.config.idGenerator = undefined
      const id = await parent.meta.generateID(parent)
      expect(id).toBeInstanceOf(ObjectId)
    })

    it("should use the ID generator in the model config if set", async () => {
      const id = await parent.meta.generateID(parent)
      expect(id).toEqual('foo')
    })

    it("should use the ID generator in the mongoid config if it was not set in the model config", async () => {
      parent.meta.config.idGenerator = undefined
      configure({idGenerator: customIdGenerator})
      const id = await parent.meta.generateID(parent)

      expect(parent.meta.config.idGenerator).toBeUndefined()
      expect(id).toBe('foo')
    })

    it("should use the ID generator when using `ensureID()`", async () => {
      const parent = new Parent()
      await parent.ensureID()
      expect(parent.id).toEqual('foo')
    })

    it("should use the ID generator when saving a new model", async () => {
      const spy = jest.spyOn(MockCollection.prototype, 'insertOne')

      const parent = new Parent({name: "Parent 1"})
      await backend.save(parent)

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'foo'
      }), expect.anything())
    })

  })

  describe("ID adapters", () => {

    beforeEach(() => {
      parent.meta.config.idGenerator = customIdGenerator
      parent.meta.config.idAdapter   = customIdAdapter
    })

    afterEach(() => {
      parent.meta.config.idGenerator = undefined
      parent.meta.config.idAdapter   = undefined
    })

    it("should use the ID adapter in the model config if set", async () => {
      const toMongo   = parent.meta.idToMongo('foo')
      const fromMongo = parent.meta.idFromMongo('FOO')

      expect(toMongo).toEqual('FOO')
      expect(fromMongo).toEqual('foo')
    })

    it("it should fallback to the ID adapter in the mongoid config if it was not set in the model config", async () => {
      parent.meta.config.idGenerator = undefined
      parent.meta.config.idAdapter   = undefined

      configure({
        idGenerator: customIdGenerator,
        idAdapter:   customIdAdapter,
      })

      const id        = await parent.meta.generateID(parent)
      const toMongo   = parent.meta.idToMongo('bar')
      const fromMongo = parent.meta.idFromMongo('BAR')

      expect(parent.meta.config.idAdapter).toBeUndefined()
      expect(toMongo).toEqual('BAR')
      expect(fromMongo).toEqual('bar')
    })

    it("should use `idToMongo` building a query cursor", async () => {
      const spy = jest.spyOn(MockCollection.prototype, 'find')
        .mockReturnValue(new MockCursor())

      const query = Parent.filter({id: 'foo'})
      await backend.query(query).find()

      expect(spy).toHaveBeenCalledWith(
        {$and: [{_id: 'FOO'}]}
      )
    })

    test.todo("should use `idFromMongo` when using `QueryExecutor#pluck`")

    test.todo("should use `idFromMongo` when using `Aggegration#pluck`")

    test.todo("should use `idFromMongo` when hydrating a model")

    it("should use `idToMongo` when inserting a model document", async () => {
      const spy = jest.spyOn(MockCollection.prototype, 'insertOne')

      const parent = new Parent({id: 'foo', name: "Parent 1"})
      await backend.save(parent)

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({_id: 'FOO'}),
        expect.anything()
      )
    })

    it("should use `idToMongo` when updating a model document", async () => {
      const spy = jest.spyOn(MockCollection.prototype, 'updateOne')

      const parent = await backend.create({id: 'foo', name: "Parent 1"})
      parent.name = "Parent 2"
      await backend.save(parent)

      expect(spy).toHaveBeenCalledWith(
        {_id: 'FOO'},
        expect.anything(),
        expect.anything()
      )
    })

  })

})

const customIdGenerator = () => 'foo'
const customIdAdapter   = {
  toMongo:   (id: string) => id.toUpperCase(),
  fromMongo: (id: ID)     => id.toString().toLowerCase()
}