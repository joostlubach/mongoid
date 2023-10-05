import { ObjectId } from 'mongodb'
import { ID } from 'typings'
import { configure } from '../config'
import { Parent } from './datamodel'

describe("ID", () => {
  let parent: Parent

  beforeEach(() => {
    parent = new Parent()
  })

  describe("ID generators", () => {

    afterEach(() => {
      parent.meta.config.idGenerator = undefined
    })

    it("should use Object IDs by default", async () => {
      const id = await parent.meta.generateID(parent)
      expect(id).toBeInstanceOf(ObjectId)
    })

    it("should use the ID generator in the model config if set", async () => {
      parent.meta.config.idGenerator = customIdGenerator
      const id = await parent.meta.generateID(parent)
      expect(id).toEqual('123')
    })

    it("should use the ID generator in the mongoid config if it was not set in the model config", async () => {
      configure({idGenerator: customIdGenerator})
      const id = await parent.meta.generateID(parent)

      expect(parent.meta.config.idGenerator).toBeUndefined()
      expect(id).toBe('123')
    })
  })

  describe("ID adapters", () => {

    afterEach(() => {
      parent.meta.config.idGenerator = undefined
      parent.meta.config.idAdapter   = undefined
    })

    it("should use the ID adapter in the model config if set", async () => {
      parent.meta.config.idGenerator = customIdGenerator
      parent.meta.config.idAdapter   = customIdAdapter

      const id        = await parent.meta.generateID(parent)
      const toMongo   = await parent.meta.idToMongo(id)
      const fromMongo = await parent.meta.idFromMongo(id)

      expect(toMongo).toEqual('1')
      expect(fromMongo).toEqual('1')
    })

    it("it should fallback to the ID adapter in the mongoid config if it was not set in the model config", async () => {
      configure({
        idGenerator: customIdGenerator,
        idAdapter:   customIdAdapter,
      })

      const id        = await parent.meta.generateID(parent)
      const toMongo   = await parent.meta.idToMongo(id)
      const fromMongo = await parent.meta.idFromMongo(id)

      expect(parent.meta.config.idAdapter).toBeUndefined()
      expect(toMongo).toEqual('1')
      expect(fromMongo).toEqual('1')
    })

    it("should use the ID adapter in a query filter", async () => {
      configure({idAdapter: customIdAdapter})

      const id    = customIdGenerator()
      const query = Parent.query().filter({id: id})

      expect(query.filters[0]._id).toEqual('1')
    })
  })
})

const customIdGenerator = () => '123'
const customIdAdapter   = {
  toMongo:   (id: string) => id[0],
  fromMongo: (id: ID)     => id.toString()[0],
}