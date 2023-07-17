export default class InconsistencyError extends Error {
    constructor(Model, message) {
        super(`Inconsistent model \`${Model.name}\`: ${message}`);
        this.Model = Model;
    }
    Model;
    toJSON() {
        return {
            message: this.message,
        };
    }
}
