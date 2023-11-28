import { MongoClient } from 'mongodb'
import { ValidatorResult } from 'validator'

import { ModelBackend } from '../backend'
import { hook } from '../hooks'
import Model from '../Model'
import { model } from '../registry'
import { testClient } from './client'

describe('hooks', () => {
  let client: MongoClient

  beforeEach(async () => {
    client = await testClient()
  })

  describe('initialize', () => {})

  describe('beforeValidate', () => {
    it("allows specifying a callback to run before validation", async () => {
      @model('TestModel', {schema: {}})
      class TestModel extends Model {

        @hook('beforeValidate')
        public beforeValidateHook() {}

      }

      const test = new TestModel()
      const spy = jest.spyOn(test, 'beforeValidateHook')
      const backend = new ModelBackend(client, TestModel)

      expect(spy).not.toHaveBeenCalled()
      await backend.validate(test)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('validate', () => {
    it("allows specifying a callback to run when validating", async () => {
      @model('TestModel', {schema: {}})
      class TestModel extends Model {

        @hook('validate')
        public validateHook(result: ValidatorResult<TestModel>) {}

      }

      const test = new TestModel()
      const spy = jest.spyOn(test, 'validateHook')
      const backend = new ModelBackend(client, TestModel)

      expect(spy).not.toHaveBeenCalled()
      await backend.validate(test)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(expect.any(ValidatorResult))
    })
  })

  describe('beforeSave', () => {})
  describe('afterSave', () => {})
  describe('beforeDelete', () => {})
})
