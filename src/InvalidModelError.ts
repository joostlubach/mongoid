import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import { ValidationError, ValidatorResultSerialized } from 'validator'
import { sparse } from 'ytil'

import Model from './Model'
import { ModelClass } from './typings'

export default class InvalidModelError<M extends Model> extends Error {

  constructor(Model: ModelClass<M>, result: ValidatorResultSerialized) {
    const message = stripAnsi(InvalidModelError.description(Model, result))
    super(message)

    this.Model = Model
    this.result = result
  }

  public readonly Model:  ModelClass<M>
  public readonly result: ValidatorResultSerialized

  public get errors(): ValidationError[] {
    return this.result.errors
  }

  public toJSON() {
    return {
      message: this.message,
      result:  this.result,
    }
  }

  public static description(Model: ModelClass<any>, result: ValidatorResultSerialized, pretty: boolean = false) {
    let description = chalk`{red.underline Invalid model {yellow \`${Model.name}\`}:}`
    if (pretty) { description += '\n' }

    for (const {path, code, message} of result.errors) {
      description += sparse([
        '  - ',
        path != null && chalk`{yellow ${path}}:`,
        code != null && chalk`{red [${code}]}`,
        message != null && chalk`{red.dim ${message}}`,
      ]).join(' ')
      if (pretty) { description += '\n' }
    }

    return description
  }

  public printFriendly() {
    const message = InvalidModelError.description(this.Model, this.result, true)
    process.stderr.write(message)
  }

}
