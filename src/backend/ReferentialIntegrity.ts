import chalk from 'chalk'
import { isArray, some } from 'lodash'
import { MongoClient } from 'mongodb'
import { MapBuilder, MapUtil, modifyInObject, splitArray } from 'ytil'

import Model from '../Model'
import config from '../config'
import { getAllModelClasses } from '../registry'
import { Ref, RefDeleteStrategy, RefOptions } from '../types/ref'
import { ID, ModelClass } from '../typings'
import ModelBackend from './ModelBackend'

export default class ReferentialIntegrity {

  constructor(
    private readonly client: MongoClient
  ) {}

  // #region Reference collection

  /**
   * Derives a flat list of references from the model from its `ref`-type declarations. This list is indexed by MongoDB,
   * and is used to look up all models affected by a deletion.
   */
  public collectReferences<M extends Model>(model: M) {
    const references: Reference[] = []

    model.meta.modelType.traverse?.(model, [], (value, path, type) => {
      if (type.name !== 'ref') { return }
      if (!(value instanceof Ref)) { return }

      const options = type.options as RefOptions<any, any>
      if (options.onDelete === 'ignore') { return }

      references.push({
        path,
        model:    value.Model.name,
        id:       value.id,
        strategy: this.strategy(options.onDelete),
      })
    })

    return references
  }

  private strategy(onDelete?: RefDeleteStrategy<any>): Reference['strategy'] {
    switch (onDelete) {
    case 'delete': return 'delete'
    case 'disallow': return 'disallow'
    case 'cascade': return 'cascade'
    default: return 'other'
    }
  }

  // #endregion

  // #region Deletion

  /**
   * Processes deletion of model instances.
   */
  public async processDeletion<M extends Model>(Model: ModelClass<M>, ids: ID[]) {
    // Find all effected models by this deletion.
    const affectedModels = await this.findAffectedModels(Model, ids)
    this.logDeletion(Model, ids, affectedModels)

    // Find all models that have a 'cascade' or 'delete' reference. They will be deleted.
    const [deletedModels, rest] = splitArray(affectedModels, it => some(it.references, it => it.strategy === 'cascade' || it.strategy === 'delete'))

    // For those models that remain, check if any of them disallow the deletion. If so, throw an error.
    const disallowed = rest
      .map(affectedModel => ({
        ...affectedModel,
        references: affectedModel.references.filter(it => it.strategy === 'disallow'),
      }))
      .filter(it => it.references.length > 0)

    if (disallowed.length > 0) {
      throw new ReferentialIntegrityError("Deletion disallowed due to referential integrity rules", disallowed)
    }

    // Delete all the models to delete. Use a fast method for delete models, and a slow method (one by one) for the cascade models.
    const [cascadeModels, deleteModels] = splitArray(deletedModels, it => some(it.references, it => it.strategy === 'cascade'))
    await this.fastDeleteModels(deleteModels, ids)
    await Promise.all(cascadeModels.map(model => this.cascadeDelete(model)))

    // Finally, process the rest.
    await Promise.all(rest.map(model => this.processReferences(model)))
  }

  /**
   * Retrieves a list of all models affected by a deletion of the model, and all affected references by model.
   */
  public async findAffectedModels<M extends Model>(Model: ModelClass<M>, ids: ID[]): Promise<AffectedModel[]> {
    const affectedModels: AffectedModel[] = []
    
    const promises = getAllModelClasses().map(async RefModel => {
      const backend = this.backend(RefModel)
      const items = await backend.query(RefModel.filter({
        _references: {
          $elemMatch: {
            model: Model.name,
            id:    {$in: ids},
          },
        },
      }).project({
        id:          1,
        _references: 1,
      })).rawArray()

      for (const item of items) {
        affectedModels.push({
          Model:      RefModel,
          id:         item._id,
          references: item._references.filter((ref: Reference) => (
            ref.model === Model.modelName && ids.includes(ref.id)
          )),
        })
      }
    })
    await Promise.all(promises)

    return affectedModels
  }

  private async fastDeleteModels(affectedModels: AffectedModel[], deletedIDs: ID[]) {
    const byModelClass = MapBuilder.groupBy(affectedModels, model => model.Model)
    for (const [Model, models] of byModelClass) {
      const ids = models.map(it => it.id)
      await this.backend(Model).query(Model.filter({id: {$in: ids}})).deleteAll()
    }
  }

  private async cascadeDelete(affectedModel: AffectedModel) {
    const backend = this.backend(affectedModel.Model)
    await backend.delete(affectedModel.id)
  }

  private async processReferences(affectedModel: AffectedModel) {
    const backend = this.backend(affectedModel.Model)
    const model = await backend.query().get(affectedModel.id)
    if (model == null) { return }

    let modified: boolean = false
    for (const reference of affectedModel.references) {
      const strategy = findRefStrategy(model, reference.path)
      if (strategy == null) { continue }

      const mod = await this.fixReference(model, reference, strategy)
      modified ||= mod
    }

    if (modified) {
      await backend.save(model)
    }
  }

  private async fixReference(model: Model, reference: Reference, strategy: RefDeleteStrategy<any>) {
    if (RefDeleteStrategy.isCustomStrategy(strategy)) {
      await strategy(model, reference)
      return true
    }

    return modifyInObject(model, reference.path, (_, parent, key) => {
      if (strategy === 'unset') {
        if (isArray(parent)) {
          parent.splice(key as number, 1)
        } else {
          (parent as any)[key] = null
        }
      } else if (RefDeleteStrategy.isSetStrategy(strategy)) {
        (parent as any)[key] = strategy.$set
      } else {
        return false
      }
    })
  }

  private logDeletion(Model: ModelClass<any>, deletedIDs: ID[], affected: AffectedModel[]) {
    if (!process.env.DEBUG) { return }

    const modelDesc = `${Model.name} ${deletedIDs.join(', ')}`
    const affectedModelDesc = (model: AffectedModel) => `${model.Model.name} ${model.id}`

    if (affected.length === 0) {
      config.logger.debug(chalk`RefInt - Deleting {red ${modelDesc}}`)
    } else {
      config.logger.debug(chalk`RefInt - Deleting {red ${modelDesc}} {dim (${affected.map(affectedModelDesc).join(', ')})}`)
    }
  }

  // #endregion

  // #region Backends

  private backends = new Map<ModelClass<any>, ModelBackend<any>>()

  private backend<M extends Model>(model: M | ModelClass<M>): ModelBackend<M> {
    const ModelClass = model instanceof Model ? model.ModelClass : model
    return MapUtil.ensure(this.backends, ModelClass, () => new ModelBackend(this.client, ModelClass))
  }

  // #endregion

}

function findRefStrategy(model: Model, path: string): RefDeleteStrategy<any> | null {
  const type = model.meta.findAttribute(model, path)
  if (type?.name !== 'ref') { return null }

  return type.options.onDelete ?? 'unset'
}

export type CheckResult =
  | {valid: true}
  | {valid: false, invalid: Reference[]}

export type FixResult =
  | {status: FixStatus.Fixed, fixed: Reference[], failed: Reference[]}
  | {status: FixStatus.Deleted}

export enum FixStatus {
  /** The references were fixed as far as they could. The result object contains a list of fixed and failed references. */
  Fixed,

  /** The parent model was deleted because one of the invalid references had a `'cascade'` or `'delete'` strategy. */
  Deleted
}

export interface Reference {
  path:     string
  model:    string
  id:       ID
  strategy: 'disallow' | 'delete' | 'cascade' | 'other'
}

export interface AffectedModel {
  Model:      ModelClass<Model>
  id:         ID
  references: Reference[]
}

export class ReferentialIntegrityError extends Error {

  constructor(
    message: string,
    public affectedModels: AffectedModel[]
  ) {
    super(message)
  }

}
