import { isEqual } from 'lodash'
import {
  ChangeStreamDeleteDocument,
  ChangeStreamDocument,
  ChangeStreamInsertDocument,
  ChangeStreamUpdateDocument,
} from 'mongodb'
import { ObjectSchema, Validator } from 'validator'
import { objectEntries, objectKeys } from 'ytil'

import Model from './Model'
import { ModelBackend } from './backend'
import { getModelMeta } from './registry'
import { ID, ModelClass } from './typings'

export default class ModelChange<M extends Model> {

  constructor(
    public readonly type:          ModelChangeType,
    public readonly Model:         ModelClass<M>,
    public readonly id:            ID,
    public readonly modifications: Modifications<M>,
  ) {}

  // #region Record

  public static from<M extends Model>(model: M, type: ModelChangeType) {
    return new ModelChange(
      type,
      model.ModelClass,
      model.id,
      deriveModifications(model.originals as Partial<M>, model.meta.attributesForModel(model, false)),
    )
  }

  /**
   * Records changes in a model while applying some callback. The callback should wrap the call to `.save()` or
   * `.delete()`, but does not need to wrap any assigments to attributes.
   *
   * @param model The model to derive the change from.
   * @returns The change for this model (only type `Create` or `Delete`). `null` if there was no change.
   */
  public static async record<M extends Model>(model: M, callback: () => Promise<void>) {
    const wasPersisted = model.isPersisted
    const prevAttrs = model.originals as Partial<M>

    await callback()

    const isPersisted = model.isPersisted
    if (!wasPersisted && !isPersisted) { return null }

    const type =
      !isPersisted
        ? ModelChangeType.Delete
        : !wasPersisted
          ? ModelChangeType.Create
          : ModelChangeType.Update

    const nextAttrs = model.meta.attributesForModel(model, false)
    const modifications = deriveModifications<M>(prevAttrs, nextAttrs)
    if (objectKeys(modifications).length > 0) {
      return new ModelChange(type, model.ModelClass, model.id, modifications)
    } else {
      return null
    }
  }

  // #endregion

  // #region ChangeStream factories

  public static async fromMongoChangeStreamDocument<M extends Model>(backend: ModelBackend<M>, doc: ChangeStreamDocument) {
    switch (doc.operationType) {
    case 'insert':
      return await this.fromChangeStreamInsertDocument(backend, doc)
    case 'update':
      return await this.fromChangeStreamUpdateDocument(backend, doc)
    case 'delete':
      return await this.fromChangeStreamDeleteDocument(backend, doc)
    default:
      throw new Error(`Operation type \`${doc.operationType}\` cannot be used to create a \`ModelChange\` instance`)
    }
  }

  private static async fromChangeStreamInsertDocument<M extends Model>(backend: ModelBackend<M>, doc: ChangeStreamInsertDocument) {
    const model = await backend.hydrate(doc.fullDocument)
    const {_id: id, ...rest} = doc.fullDocument

    return new ModelChange(
      ModelChangeType.Create,
      backend.Model,
      model.id,
      deriveModifications({}, {id, ...rest} as Partial<M>),
    )
  }

  private static async fromChangeStreamUpdateDocument<M extends Model>(backend: ModelBackend<M>, doc: ChangeStreamUpdateDocument, previous?: M) {
    const change = new ModelChange(ModelChangeType.Update, backend.Model, doc.documentKey._id, {})
    const schema = await this.getSchema(backend, doc, previous)
    if (schema == null) {
      throw new Error("Unable to derive schema")
    }

    const validator = new Validator()
    const coerce = (attribute: string, value: any) => {
      const type = schema[attribute]
      if (type != null) {
        return validator.coerce(value, type, true)
      } else {
        return value
      }
    }

    // Process updates.
    for (const [field, nextValue] of objectEntries(doc.updateDescription.updatedFields ?? {})) {
      if (typeof field !== 'string') { continue }

      change.modifications[field as keyof M] = {
        prevValue: doc.fullDocumentBeforeChange == null ? UNKNOWN : doc.fullDocumentBeforeChange[field],
        nextValue: coerce(field, nextValue),
      }
    }

    // Process removals.
    for (const field of doc.updateDescription.removedFields ?? []) {
      change.modifications[field as keyof M] = {
        prevValue: doc.fullDocumentBeforeChange == null ? UNKNOWN : doc.fullDocumentBeforeChange[field],
        nextValue: undefined,
      }
    }

    return change
  }

  private static async fromChangeStreamDeleteDocument<M extends Model>(backend: ModelBackend<M>, doc: ChangeStreamDeleteDocument) {
    return this.deletion(backend.Model, doc.documentKey._id)
  }

  private static async getSchema<M extends Model>(backend: ModelBackend<M>, doc: ChangeStreamUpdateDocument, previous?: M): Promise<ObjectSchema> {
    const meta = getModelMeta(Model)
    if (meta.config.polymorphic) {
      const type = await this.getType(backend, doc, previous)
      return meta.config.schemas[type]
    } else {
      return meta.config.schema
    }
  }

  private static async getType<M extends Model>(backend: ModelBackend<M>, doc: ChangeStreamUpdateDocument, previous?: M) {
    if (doc.updateDescription.updatedFields?.type != null) {
      return doc.updateDescription.updatedFields.type
    }

    // Try to retrieve without lookup.
    if (doc.fullDocument != null) {
      return doc.fullDocument.type
    } else if (doc.fullDocumentBeforeChange != null) {
      return doc.fullDocumentBeforeChange.type
    } else if ((previous as any)?.type != null) {
      return (previous as any).type
    }

    const query = backend.Model.filter({_id: doc.documentKey._id})
    const types = await backend.query(query).pluck('type')
    if (types.length === 0) {
      throw new Error(`Cannot determine type of document with id \`${doc.documentKey._id}\``)
    }

    return types[0]
  }

  // #endregion

  // #region Deletion

  public static deletion<M extends Model>(Model: ModelClass<M>, id: ID) {
    return new ModelChange<M>(
      ModelChangeType.Delete,
      Model,
      id,
      {},
    )
  }

  // #endregion

}

function deriveModifications<M extends Model>(prevAttributes: Partial<M>, nextAttributes: Partial<M>): Modifications<M> {
  const allNames: Set<string> = new Set()
  for (const name of Object.keys(prevAttributes)) {
    allNames.add(name)
  }
  for (const name of Object.keys(nextAttributes)) {
    allNames.add(name)
  }

  // TODO: Deep derivation?
  const modifications: Modifications<M> = {}
  for (const name of allNames) {
    const prevValue = (prevAttributes as any)[name]
    const nextValue = (nextAttributes as any)[name]
    if (isEqual(prevValue, nextValue)) { continue }

    modifications[name as keyof M] = {prevValue, nextValue}
  }
  return modifications
}

export enum ModelChangeType {
  Create,
  Update,
  Delete,
}

export type Modifications<M extends Model> = Partial<{
  [path in keyof M]: {
    prevValue?: M[path] | UNKNOWN
    nextValue?: M[path]
  }
}>

export const UNKNOWN = Symbol('unknown')
export type UNKNOWN = typeof UNKNOWN
