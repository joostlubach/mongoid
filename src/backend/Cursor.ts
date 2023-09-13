import { AggregationCursor, FindCursor as MongoCursor } from 'mongodb'
import { Ref } from 'types/ref'
import Model from '../Model'
import { ModelClass } from '../typings'
import ModelBackend from './ModelBackend'

export default class Cursor<M extends Model> {

  constructor(
    public readonly backend: ModelBackend<M>,
    public readonly cursor: MongoCursor | AggregationCursor,
    private readonly options: CursorOptions = {}
  ) {}

  private get Model() {
    return this.backend?.Model ?? null
  }

  public async *[Symbol.asyncIterator]() {
    for await (const document of this.cursor) {
      const model = await this.Model.hydrate(document) as M
      await this.includeRefs([model])
      yield model
    }
  }

  public async map<U>(transform: (model: M) => U | Promise<U>): Promise<Promise<U>[]> {
    return await this.cursor.map(async document => {
      const model = await this.Model.hydrate(document) as M
      await this.includeRefs([model])
      return await transform(model)
    }).toArray()
  }

  public hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  public async next(): Promise<M | null> {
    const document = await this.cursor.next()
    if (document == null) { return null }

    return await this.Model.hydrate(document) as M
  }

  public async toArray(): Promise<M[]> {
    const documents = await this.cursor.toArray()
    const promises  = documents.map(doc => this.Model.hydrate(doc)) as Array<Promise<M>>
    const models = await Promise.all(promises)
    await this.includeRefs(models)
    return models
  }

  //------
  // Include refs

  private async includeRefs(models: M[]) {
    const refs: Map<ModelClass<any>, Ref<any>[]> = new Map()

    for (const model of models) {
      this.findIncludeRefs(model, (ref: Ref<any>) => {
        const refsForModel = refs.get(ref.Model) ?? []
        refs.set(ref.Model, refsForModel)
        refsForModel.push(ref)
      })
    }

    const promises = Array
      .from(refs.values())
      .map(async refs => this.backend.getAllRefs(refs))

    await Promise.all(promises)
  }

  private findIncludeRefs(model: M, addRef: (ref: Ref<any>) => void) {
    const modelType = model.meta.modelType
    if (modelType.traverse == null) { return [] }

    const isIncluded = (ref: Ref<any>, path: string) => {
      if (ref.include === 'never') { return false }
      if (ref.include === 'always') { return true }

      return this.options.include?.includes(path)
    }

    modelType.traverse(model, [], (value, path, type) => {
      if (type.name !== 'ref') { return }
      if (!(value instanceof Ref)) { return }
      if (isIncluded(value, path)) { addRef(value) }
    })
  }

}

export interface CursorOptions {
  include?: string[]
}