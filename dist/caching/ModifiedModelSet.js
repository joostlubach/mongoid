export default class ModifiedModelSet {
    //------
    // Models
    models = new Set();
    get all() {
        return Array.from(this.models);
    }
    add(model) {
        this.models.add(model);
    }
    //------
    // Saving
    afterSaveCallbacks = new Set();
    afterSave(callback) {
        this.afterSaveCallbacks.add(callback);
    }
    async save(options = {}) {
        const promises = [...this.models].map(async (model) => {
            await model.save(options);
            const promises = [...this.afterSaveCallbacks].map(cb => cb(model));
            await Promise.all(promises);
        });
        await Promise.all(promises);
    }
}
