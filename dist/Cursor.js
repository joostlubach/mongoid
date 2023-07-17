import { Ref } from './types/ref';
export default class Cursor {
    query;
    cursor;
    options;
    constructor(query, cursor, options) {
        this.query = query;
        this.cursor = cursor;
        this.options = options;
    }
    get Model() {
        return this.query.Model;
    }
    async count() {
        return await this.query.count();
    }
    async forEach(iterator) {
        const promises = await this.cursor.map(async (document) => {
            const model = await this.Model.hydrate(document);
            await this.includeRefs([model]);
            await iterator(model);
        }).toArray();
        return await Promise.all(promises).then(() => undefined);
    }
    async map(iterator) {
        return await this.cursor.map(async (document) => {
            const model = await this.Model.hydrate(document);
            await this.includeRefs([model]);
            return await iterator(model);
        }).toArray();
    }
    hasNext() {
        return this.cursor.hasNext();
    }
    async next() {
        const document = await this.cursor.next();
        if (document == null) {
            return null;
        }
        return await this.Model.hydrate(document);
    }
    async toArray() {
        const documents = await this.cursor.toArray();
        const promises = documents.map(doc => this.Model.hydrate(doc));
        const models = await Promise.all(promises);
        await this.includeRefs(models);
        return models;
    }
    //------
    // Include refs
    async includeRefs(models) {
        const refs = new Map();
        for (const model of models) {
            this.findIncludeRefs(model, (ref) => {
                const refsForModel = refs.get(ref.Model) ?? [];
                refs.set(ref.Model, refsForModel);
                refsForModel.push(ref);
            });
        }
        const promises = Array
            .from(refs.values())
            .map(async (refs) => Ref.getAll(refs));
        await Promise.all(promises);
    }
    findIncludeRefs(model, addRef) {
        const modelType = model.meta.modelType;
        if (modelType.traverse == null) {
            return [];
        }
        const isIncluded = (ref, path) => {
            if (ref.include === 'never') {
                return false;
            }
            if (ref.include === 'always') {
                return true;
            }
            return this.options.include?.includes(path);
        };
        modelType.traverse(model, [], (value, path, type) => {
            if (type.name !== 'ref') {
                return;
            }
            if (!(value instanceof Ref)) {
                return;
            }
            if (isIncluded(value, path)) {
                addRef(value);
            }
        });
    }
}
