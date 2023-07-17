export default class AggregationCursor {
    Model;
    cursor;
    constructor(Model, cursor) {
        this.Model = Model;
        this.cursor = cursor;
    }
    forEach(iterator) {
        return new Promise((resolve, reject) => {
            const next = async (error, document) => {
                if (error != null) {
                    reject(error);
                }
                else if (document == null) {
                    resolve();
                }
                else {
                    try {
                        const model = await this.Model.hydrate(document);
                        await iterator(model);
                        this.cursor.next(next);
                    }
                    catch (error) {
                        reject(error);
                    }
                }
            };
            this.cursor.next(next);
        });
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
        return await Promise.all(promises);
    }
}
