import { mapValues, isEqual } from 'lodash';
export default class Change {
    type;
    Model;
    id;
    modifications;
    constructor(type, Model, id, modifications) {
        this.type = type;
        this.Model = Model;
        this.id = id;
        this.modifications = modifications;
    }
    static fromModel(model, type) {
        if (model.id == null) {
            throw new TypeError("Model not saved");
        }
        const prevAttributes = (model.originals || {});
        const nextAttributes = type === 'delete' ? {} : model.meta.getAttributes(model, false);
        const modifications = deriveModifications(prevAttributes, nextAttributes);
        return new Change(type, model.constructor, model.id, modifications);
    }
    get prevAttributes() {
        return mapValues(this.modifications, mod => mod.prevValue);
    }
    get nextAttributes() {
        return mapValues(this.modifications, mod => mod.nextValue);
    }
    modified(attribute) {
        return attribute in this.modifications;
    }
}
function deriveModifications(prevAttributes, nextAttributes) {
    const allNames = new Set();
    for (const name of Object.keys(prevAttributes)) {
        allNames.add(name);
    }
    for (const name of Object.keys(nextAttributes)) {
        allNames.add(name);
    }
    // TODO: Deep derivation?
    const modifications = {};
    for (const name of allNames) {
        const prevValue = prevAttributes[name];
        const nextValue = nextAttributes[name];
        if (isEqual(prevValue, nextValue)) {
            continue;
        }
        modifications[name] = { prevValue, nextValue };
    }
    return modifications;
}
