import Model from '../Model'
import { SaveOptions } from '../typings'

export default class ModifiedModelSet<M extends Model = any> {

  //------
  // Models

  private models = new Set<M>()

  public get all(): M[] {
    return Array.from(this.models)
  }

  public add(model: M) {
    this.models.add(model)
  }

  //------
  // Saving

  private afterSaveCallbacks = new Set<AfterSaveCallback<M>>()

  public afterSave(callback: AfterSaveCallback<M>) {
    this.afterSaveCallbacks.add(callback)
  }

  public async save(options: SaveOptions = {}) {
    const promises = [...this.models].map(async model => {
      await model.save(options)

      const promises = [...this.afterSaveCallbacks].map(cb => cb(model))
      await Promise.all(promises)
    })

    await Promise.all(promises)
  }

}

export type AfterSaveCallback<M extends Model> = (model: M) => any