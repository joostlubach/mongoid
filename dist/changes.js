import Change from './Change';
import Model from './Model';
const changeListeners = new WeakMap();
function addListener(...args) {
    let ModelClass = Model;
    let listener;
    if (args.length === 1) {
        listener = args[0];
    }
    else {
        ModelClass = args[0];
        listener = args[1];
    }
    let listeners = changeListeners.get(ModelClass);
    if (listeners == null) {
        changeListeners.set(ModelClass, listeners = new Set());
    }
    listeners.add(listener);
}
function removeListener(...args) {
    let ModelClass = Model;
    let listener;
    if (args.length === 1) {
        listener = args[0];
    }
    else {
        ModelClass = args[0];
        listener = args[1];
    }
    const listeners = changeListeners.get(ModelClass);
    if (listeners == null) {
        return;
    }
    listeners.delete(listener);
}
export { addListener, removeListener };
//------
// Emit change
export function emitCreate(model) {
    const listeners = resolveChangeListeners(model.constructor);
    if (listeners.length === 0) {
        return;
    }
    const change = Change.fromModel(model, 'create');
    listeners.forEach(listener => listener(model, change));
}
export function emitUpdate(model) {
    const listeners = resolveChangeListeners(model.constructor);
    if (listeners.length === 0) {
        return;
    }
    const change = Change.fromModel(model, 'update');
    listeners.forEach(listener => listener(model, change));
}
export function emitDelete(model) {
    const listeners = resolveChangeListeners(model.constructor);
    if (listeners.length === 0) {
        return;
    }
    const change = Change.fromModel(model, 'delete');
    listeners.forEach(listener => listener(model, change));
}
function getOwnChangeListeners(Model) {
    const listeners = changeListeners.get(Model);
    if (listeners == null) {
        return [];
    }
    return Array.from(listeners);
}
function resolveChangeListeners(ModelClass) {
    const listeners = getOwnChangeListeners(ModelClass);
    if (ModelClass === Model || ModelClass === Object) {
        return listeners;
    }
    const Super = ModelClass.__proto__;
    if (Super == null) {
        return listeners;
    }
    return [...listeners, ...resolveChangeListeners(Super)];
}
