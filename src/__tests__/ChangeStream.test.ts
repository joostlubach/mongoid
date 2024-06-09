import { DateTime } from 'luxon'
import {
  ChangeStreamDeleteDocument,
  ChangeStreamDocument,
  ChangeStreamInsertDocument,
  ChangeStreamUpdateDocument,
} from 'mongodb'
import { ValuedSemaphore } from 'semaphore'
import { delay } from 'yest'
import { safeParseInt } from 'ytil'

import ModelChange, { ModelChangeType, UNKNOWN } from '../ModelChange'
import { ChangeStream, ChangeStreamOptions, ModelBackend, MongoClient } from '../backend'
import { testClient } from './client'
import { Parent } from './datamodel/family'

const describe = process.env.CHANGE_STREAMS === '0' ? global.describe.skip : global.describe
const TIMEOUT = safeParseInt(process.env.TEST_TIMEOUT) ?? 10_000
const SEMAPHORE_TIMEOUT = TIMEOUT / 20

describe("ChangeStream", () => {

  let client:    MongoClient
  let backend:   ModelBackend<Parent>

  let _stream:    ChangeStream<Parent>
  let _semaphore: ValuedSemaphore<any>

  beforeEach(async () => {
    client = await testClient()
    backend = new ModelBackend(client, Parent)
  })

  afterEach(async () => {
    _semaphore?.dispose()
    await _stream?.close()
  })

  describe("raw interface", () => {

    describe('insert', () => {

      it("should receive insert changes", async () => {
        const {semaphore} = await createStream<ChangeStreamInsertDocument>()

        await backend.create({name: "Parent 1"})
        const change = await semaphore
        expect(change).toEqual(expect.objectContaining({
          operationType: 'insert',
        }))
      }, TIMEOUT)

      it("should always include the .fullDocument property", async () => {
        const {semaphore} = await createStream<ChangeStreamInsertDocument>()

        await backend.create({name: "Parent 1"})
        const change = await semaphore
        expect(change.fullDocument).toEqual({
          _id:         expect.anything(),
          name:        "Parent 1",
          age:         null,
          job:         null,
          children:    [],
          createdAt:   expect.any(Date),
          updatedAt:   expect.any(Date),
          _references: [],
        })
      }, TIMEOUT)

    })

    describe('update', () => {
      let parent: Parent

      beforeEach(async () => {
        parent = await backend.create({name: "Parent 1"})
      })

      it("should receive update changes", async () => {
        const {semaphore} = await createStream<ChangeStreamUpdateDocument>()

        parent.assign({name: "Parent 2"})
        await backend.save(parent)

        const change = await semaphore
        expect(change).toEqual(expect.objectContaining({
          operationType: 'update',
        }))
      }, TIMEOUT)

      it("should by default have an undefined `.fullDocument` and `.fullDocumentBeforeChange` property", async () => {
        const {semaphore} = await createStream<ChangeStreamUpdateDocument>()

        parent.assign({name: "Parent 2"})
        await backend.save(parent)

        const change = await semaphore
        expect(change.fullDocument).toBeUndefined()
        expect(change.fullDocumentBeforeChange).toBeUndefined()
      }, TIMEOUT)

      it("shold set the `.fullDocument` and `.fullDocumentBeforeChange` properties if `{full: true}` is passed", async () => {
        const {semaphore} = await createStream<ChangeStreamUpdateDocument>({full: true})

        parent.assign({name: "Parent 2"})
        await backend.save(parent)

        const change = await semaphore
        expect(change.fullDocument).toBeDefined()
        expect(change.fullDocumentBeforeChange).toBeDefined()
      }, TIMEOUT)

      it("should have an `.updateDescription` property containing a description of what's changed", async () => {
        const {semaphore} = await createStream<ChangeStreamUpdateDocument>()

        parent.assign({name: "Parent 2"})
        await backend.save(parent)

        const change = await semaphore
        expect(change.updateDescription).toEqual({
          updatedFields: {
            name:      "Parent 2",
            updatedAt: expect.any(Date),
          },

          removedFields:   [],
          truncatedArrays: [],
        })
      }, TIMEOUT)

    })

    describe('delete', () => {
      let parent: Parent

      beforeEach(async () => {
        parent = await backend.create({name: "Parent 1"})
      })

      it("should receive delete changes", async () => {
        const {semaphore} = await createStream<ChangeStreamDeleteDocument>()

        await backend.delete(parent)

        const change = await semaphore
        expect(change).toEqual(expect.objectContaining({
          operationType: 'delete',
        }))
      }, TIMEOUT)

      it("should have a `.fullDocumentBeforeChange` property that is by default undefined", async () => {
        const {semaphore} = await createStream<ChangeStreamDeleteDocument>()

        await backend.delete(parent)

        const change = await semaphore
        expect(change.fullDocumentBeforeChange).toBeUndefined()
      }, TIMEOUT)

      it("should have iets `.fullDocumentBeforeChange` set if `{full: true}` is passed", async () => {
        const {semaphore} = await createStream<ChangeStreamDeleteDocument>({full: true})

        await backend.delete(parent)

        const change = await semaphore
        expect(change.fullDocumentBeforeChange).toBeDefined()
      }, TIMEOUT)

    })

    async function createStream<D extends ChangeStreamDocument>(options: ChangeStreamOptions<any> = {}) {
      const stream = ChangeStream.watchModel(backend, options)
      const semaphore = new ValuedSemaphore<D>({timeout: SEMAPHORE_TIMEOUT})
      const handler = jest.fn<void, [D]>().mockImplementation(doc => {
        semaphore.signal(doc)
      })

      stream.addListener(handler as any, {raw: true})

      // For some reason, MongoDB needs to use the event loop to start the stream.
      await delay(0)

      _stream = stream
      _semaphore = semaphore

      return {stream, semaphore}
    }
  })

  describe("model interface", () => {

    describe('insert', () => {
      
      test("receiving .Create changes", async () => {
        const {semaphore} = await createStream()

        await backend.create({name: "Parent 1"})
        const change = await semaphore
        expect(change).toEqual({
          type:  ModelChangeType.Create,
          Model: Parent,
          id:    expect.anything(),

          modifications: {
            name:     {prevValue: undefined, nextValue: "Parent 1"},
            age:      {prevValue: undefined, nextValue: null},
            job:      {prevValue: undefined, nextValue: null},
            children: {prevValue: undefined, nextValue: []},

            updatedAt: {prevValue: undefined, nextValue: expect.any(DateTime)},
            createdAt: {prevValue: undefined, nextValue: expect.any(DateTime)},
          },
        })
      }, TIMEOUT)

    })

    describe('update', () => {
      let parent: Parent

      beforeEach(async () => {
        // For updates, we turn this on to allow fullDocumentBeforeChange to be set.
        await backend.client.db().createCollection('parents', {
          changeStreamPreAndPostImages: {
            enabled: true,
          },
        })

        parent = await backend.create({name: "Parent 1"})
      })

      test("if {full: true} is not passed, prevValues are UNKNOWN", async () => {
        const {semaphore} = await createStream()

        parent.assign({name: "Parent 2"})
        await backend.save(parent)

        const change = await semaphore
        expect(change).toEqual(new ModelChange(
          ModelChangeType.Update,
          Parent,
          parent.id,
          {
            name:      {prevValue: UNKNOWN, nextValue: "Parent 2"},
            updatedAt: {prevValue: UNKNOWN, nextValue: expect.any(DateTime)},
          },
        ))
      }, TIMEOUT)

      test("if {full: true} is passed, prevValues are derived from the model", async () => {
        const {semaphore} = await createStream({full: true})

        parent.assign({name: "Parent 2"})
        await backend.save(parent)

        const change = await semaphore
        expect(change).toEqual(new ModelChange(
          ModelChangeType.Update,
          Parent,
          parent.id,
          {
            name:      {prevValue: "Parent 1", nextValue: "Parent 2"},
            updatedAt: {prevValue: expect.any(DateTime), nextValue: expect.any(DateTime)},
          },
        ))
      }, TIMEOUT)

    })

    describe('delete', () => {
      let parent: Parent

      beforeEach(async () => {
        parent = await backend.create({name: "Parent 1"})
      })

      test("receiving .Delete changes", async () => {
        const {semaphore} = await createStream()

        await backend.delete(parent)

        const change = await semaphore
        expect(change).toEqual(new ModelChange(
          ModelChangeType.Delete,
          Parent,
          parent.id,
          {},
        ))
      }, TIMEOUT)

    })

    async function createStream(options: ChangeStreamOptions<Parent> = {}) {
      const stream = ChangeStream.watchModel(backend, options)
      const semaphore = new ValuedSemaphore<ModelChange<Parent>>({timeout: SEMAPHORE_TIMEOUT})
      const handler = jest.fn<void, [ModelChange<Parent>]>().mockImplementation(doc => {
        semaphore.signal(doc)
      })

      stream.addListener(handler as any)

      // For some reason, MongoDB needs to use the event loop to start the stream.
      await delay(0)

      _stream = stream
      _semaphore = semaphore

      return {stream, semaphore}
    }
  })

})
