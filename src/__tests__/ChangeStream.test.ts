import { ChangeStreamDocument } from 'mongodb'
import { ValuedSemaphore } from 'semaphore'
import { ChangeStream, ModelBackend, MongoClient } from '../backend'
import { testClient } from './client'
import { Parent } from './datamodel'

describe("ChangeStream", () => {

  let client: MongoClient
  let backend: ModelBackend<Parent>
  let stream: ChangeStream<Parent>

  beforeEach(async () => {
    client  = await testClient()
    backend = new ModelBackend(client, Parent)
  })

  afterEach(() => {
    stream?.close()
  })

  describe("raw interface", () => {

    let handler: jest.Mock<void, [ChangeStreamDocument], any>
    let semaphore: ValuedSemaphore<ChangeStreamDocument>

    beforeEach(() => {
      stream    = ChangeStream.watchModel(client.db(), Parent)
      semaphore = new ValuedSemaphore({timeout: 500, autoReset: true})
      handler   = jest.fn().mockImplementation(doc => { semaphore.signal(doc) })

      stream.addListener(handler, {raw: true})
    })

    it("should allow receiving changes from the collection", async () => {
      // const parent = await backend.create({name: "Parent 1"})
      // const insert = await semaphore
      // expect(insert).toEqual(expect.objectContaining({
      //   operationType: 'insert',
      // }))

      // parent.assign({name: "Parent 2"})
      // await backend.save(parent)
      // const update = await semaphore
      // expect(update).toEqual(expect.objectContaining({
      //   operationType: 'update',
      // }))

    })

  })

})