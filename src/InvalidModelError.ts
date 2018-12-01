import Model from './Model'
import {ModelClass} from './typings'
import {ValidationResult, ValidationError} from '@joostlubach/validator'
import chalk from 'chalk'

export default class InvalidModelError<M extends Model> extends Error {

  constructor(Model: ModelClass<M>, result: ValidationResult) {
    const invalids = result.errors.map(err => `${err.path}: ${err.code || err.message}`)
    super(`Invalid model \`${Model.name}\` (${invalids.join(', ')})`)

    this.Model = Model
    this.result  = result
  }

  Model:  ModelClass<M>
  result: ValidationResult

  get errors(): ValidationError[] {
    return this.result.errors
  }

  toJSON() {
    return {
      message: this.message,
      errors:  this.errors
    }
  }

  printFriendly() {
    let text = chalk`{red.underline ${this.Model.name}: Validation failed:}\n`

    for (const {path, message} of this.errors) {
      text += chalk`  - {yellow ${path ? path + ': ' : ''}}{red ${message}}\n`
    }

    process.stderr.write(text)
  }

}