import chalk from 'chalk'
import { isArray, some, uniq } from 'lodash'
import { flatMap, isPlainObject, MapBuilder, modifyInObject, splitArray } from 'ytil'

import config from '../config'
import Model from '../Model'
import { getAllModelClasses, getModelClass } from '../registry'
import { Ref, RefDeleteStrategy, RefOptions } from '../types/ref'
import { ID, ModelClass } from '../typings'
import ModelBackend from './ModelBackend'

export default class ReferentialIntegrity<M extends Model> {

  constructor(
    private readonly backend: ModelBackend<M>,
    private readonly model: M,
  ) {}

  private get Model() {
    return this.model.constructor as ModelClass<M>
  }

  /**
   * Checks all referential integrity rules for this module.
   */
  public async check(options: CheckOptions = {}): Promise<CheckResult> {
    const invalid: Array<[Reference, RefDeleteStrategy<any>]> = []

    for (const reference of this.collectReferences()) {
      const retval = await this.checkReference(reference)
      if (retval !== true) {
        invalid.push([reference, retval])
      }
    }

    if (options.fix) {
      if (some(invalid, ([, strategy]) => strategy === 'cascade')) {
        await this.backend.delete(this.model)
        return {status: 'deleted'}
      }

      if (some(invalid, ([, strategy]) => strategy === 'delete')) {
        await this.backend.query(this.Model.filter({id: this.model.id})).deleteAll()
        return {status: 'deleted'}
      }

      const fixedReferences: Reference[] = []
      const failedReferences: Reference[] = []

      for (const [reference, strategy] of invalid) {
        const fixed = await this.fixReference(this.model, reference, strategy)
        if (fixed) {
          fixedReferences.push(reference)
        } else {
          failedReferences.push(reference)
        }
      }

      if (fixedReferences.length > 0) {
        await this.backend.save(this.model)
      }

      return {
        status:  'fixed',
        invalid: invalid.map(it => it[0]),
        fixed:   fixedReferences,
        failed:  failedReferences,
      }
    } else if (invalid.length > 0) {
      return {
        status:  'invalid',
        invalid: invalid.map(it => it[0]),
      }
    } else {
      return {status: 'ok'}
    }
  }

  private async checkReference(reference: Reference): Promise<true | RefDeleteStrategy<any>> {
    const Model = getModelClass(reference.model)
    if (Model == null) {
      throw new Error(`Invalid reference: model \`${reference.model}\` does not exist`)
    }

    const count = await this.backend.query(this.Model.filter({id: reference.id})).count()
    if (count > 0) { return true }

    const strategy = findRefStrategy(this.model, reference.path)
    if (strategy == null) {
      throw new Error(`Cannot fix reference ${reference.path}: no strategy found`)
    }

    return strategy
  }

  /**
   * Derives a flat list of references from the model from its `ref`-type declarations. This list is indexed by MongoDB,
   * and is used to look up all models affected by a deletion.
   */
  public collectReferences() {
    const references: Reference[] = []

    this.model.meta.modelType.traverse?.(this.model, [], (value, path, type) => {
      if (type.name !== 'ref') { return }
      if (!(value instanceof Ref)) { return }

      const options = type.options as RefOptions<any, any>
      if (options.onDelete === 'ignore') { return }

      const strategy =
        options.onDelete === 'delete'
          ? 'delete'
          : options.onDelete === 'disallow'
            ? 'disallow'
            : options.onDelete === 'cascade'
              ? 'cascade'
              : 'other'

      references.push({
        path,
        model: value.Model.name,
        id:    value.id,
        strategy,
      })
    })

    return references
  }

  /**
   * Retrieves a list of all models affected by a deletion of the model, and all affected references by model.
   */
  public async findAffectedModels(): Promise<AffectedModel[]> {
    const affectedModels: AffectedModel[] = []

    const promises = getAllModelClasses().map(async Model => {
      const items = await this.backend.query(Model.filter({
        _references: {
          $elemMatch: {
            model: this.Model.name,
            id:    this.model.id,
          },
        },
      }).project({
        id:          1,
        _references: 1,
      })).rawArray()

      for (const item of items) {
        affectedModels.push({
          Model,
          id:         item._id,
          references: item._references.filter((ref: Reference) => (
            ref.model === Model.modelName && ref.id === this.model.id
          )),
        })
      }
    })
    await Promise.all(promises)

    return affectedModels
  }

  /**
   * Processes deletion of the model.
   */
  public async processDeletion() {
    // Find all effected models by this deletion.
    const affectedModels = await this.findAffectedModels()
    this.logDeletion(affectedModels)

    // Find all models that have a 'cascade' or 'delete' reference. They will be deleted.
    const [deletedModels, rest] = splitArray(affectedModels, it => some(it.references, it => it.strategy === 'cascade' || it.strategy === 'delete'))

    // For those models that remain, check if any of them disallow the deletion. If so, throw an error.
    const references = flatMap(rest, model => model.references)
    const disallowedReferences = references.filter(ref => ref.strategy === 'disallow')
    if (disallowedReferences.length > 0) {
      throw new ReferentialIntegrityError("Deletion disallowed due to referential integrity rules", disallowedReferences)
    }

    // Delete all the models to delete. Use a fast method for delete models, and a slow method (one by one) for the cascade models.
    const [cascadeModels, deleteModels] = splitArray(deletedModels, it => some(it.references, it => it.strategy === 'cascade'))
    await this.fastDeleteModels(deleteModels)
    await Promise.all(cascadeModels.map(model => this.cascadeDelete(model)))

    // Finally, process the rest.
    await Promise.all(rest.map(model => this.processReferences(model)))
  }

  private async fastDeleteModels(affectedModels: AffectedModel[]) {
    const byModelClass = MapBuilder.groupBy(affectedModels, model => model.Model)
    for (const [Model, models] of byModelClass) {
      const paths = uniq(flatMap(models, model => model.references).map(ref => ref.path))
      await this.backend.query(Model.filter({
        $or: paths.map(path => ({
          [path]: this.model.id,
        })),
      })).deleteAll()
    }
  }

  private async cascadeDelete(affectedModel: AffectedModel) {
    const backend = this.backend.cloneFor(affectedModel.Model)
    const model = await backend.query().get(affectedModel.id)
    await model.delete()
  }

  private async processReferences(affectedModel: AffectedModel) {
    const backend = this.backend.cloneFor(affectedModel.Model)
    const model = await backend.query().get(affectedModel.id)

    const modifieds: boolean[] = []
    for (const reference of affectedModel.references) {
      const strategy = findRefStrategy(model, reference.path)
      if (strategy == null) { continue }

      const modified = await this.fixReference(model, reference, strategy)
      modifieds.push(modified)
    }

    if (some(modifieds)) {
      await model.save()
    }
  }

  private async fixReference(model: Model, reference: Reference, strategy: RefDeleteStrategy<any>) {
    if (RefDeleteStrategy.isCustomStrategy(strategy)) {
      return await strategy(model, reference)
    }

    return modifyInObject(model, reference.path, (_, parent, key) => {
      if (strategy === 'unset') {
        if (isArray(parent)) {
          parent.splice(key as number, 1)
        } else if (isPlainObject(parent)) {
          parent[key] = null
        }
      } else if (isPlainObject(parent) && RefDeleteStrategy.isSetStrategy(strategy)) {
        parent[key] = strategy.$set
      } else {
        return false
      }
    })
  }

  private logDeletion(affected: AffectedModel[]) {
    const modelDesc = `${this.Model.name} ${this.model.id}`
    const affectedModelDesc = (model: AffectedModel) => `${model.Model.name} ${model.id}`

    if (affected.length === 0) {
      config.logger.debug(chalk`RefInt - Deleting {red ${modelDesc}}`)
    } else {
      config.logger.debug(chalk`RefInt - Deleting {red ${modelDesc}} {dim (${affected.map(affectedModelDesc).join(', ')})}`)
    }
  }

}

function findRefStrategy(model: Model, path: string): RefDeleteStrategy<any> | null {
  const type = model.meta.findSchemaType(model, path)
  if (type?.name !== 'ref') { return null }

  return type.options.onDelete ?? 'unset'
}

export interface CheckOptions {
  fix?: boolean
}

export type CheckResult =
  | {status: 'ok'}
  | {status: 'invalid', invalid: Reference[]}
  | {status: 'deleted'}
  | {status: 'fixed', invalid: Reference[], fixed: Reference[], failed: Reference[]}

export interface Reference {
  path:     string
  model:    string
  id:       ID
  strategy: 'disallow' | 'delete' | 'cascade' | 'other'
}

export interface AffectedModel {
  Model:      ModelClass<any>
  id:         ID
  references: Reference[]
}

export class ReferentialIntegrityError extends Error {

  constructor(
    message: string,
    public disallowedReferences: Reference[],
  ) {
    super(message)
  }

}
