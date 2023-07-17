import chalk from 'chalk';
import { wrapInPromise } from 'ytil';
import config from '../config';
import { isRef, Ref } from '../types/ref';
/**
 * For memory usage optimization, a way to pass a model reference around, without the need for frequent queries.
 * The retainer has two modes of operations:
 *
 * 1. Simple mode: initialize the retainer and use `.get()` subsequent times. When the retainer is freed from memory, so is
 *    the model reference.
 * 2. ARC mode: initialize the retainer and use `.retain()` and `.release()` as necessary. When the retain count hits 0,
 *    the model is freed. A callback is also invoked, allowing the site holding the retainer to release the retainer itself.
 */
export default class ModelRetainer {
    Model;
    locator;
    options;
    constructor(Model, locator, options = {}) {
        this.Model = Model;
        this.locator = locator;
        this.options = options;
        if (locator instanceof Model) {
            this.model = locator;
            this.id = this.model.id;
        }
        else if (isRef(locator)) {
            if (locator.Model !== Model) {
                throw new Error("Incompatible ref passed in.");
            }
            this.id = locator.id;
        }
        else {
            this.id = locator;
        }
    }
    id;
    //------
    // Retain / release
    retainCount = 0;
    retain() {
        this.retainCount += 1;
        this.options.logger?.debug(chalk `{dim.green Retaining {yellow ${this.Model.name} ${this.id}} {blue (${this.retainCount})}}`);
    }
    release() {
        this.retainCount -= 1;
        this.options.logger?.debug(chalk `{dim.red Released {yellow ${this.Model.name} ${this.id}} {blue (${this.retainCount})}}`);
        if (this.retainCount <= 0) {
            this.retainCount = 0;
            this.free();
        }
    }
    //------
    // Model fetching
    model = null;
    get isRetained() {
        return this.model != null;
    }
    set(model) {
        this.model = model;
    }
    get cached() {
        return this.model;
    }
    get ref() {
        return new Ref(this.Model, this.id);
    }
    async get(options = {}) {
        // Just fetch the model each time if the retainer is not set to retain.
        if (this.options.retain === false) {
            return await this.fetch(options);
        }
        // If no call to retain has been made, just retain the model once, unless requested not to.
        if (options.retain !== false && this.retainCount === 0) {
            this.retain();
        }
        // Fetch the model if it's not cached. When testing, never cache.
        if (this.model == null || options.reload || !config.cachingEnabled) {
            this.model = await this.fetch(options);
        }
        return this.model;
    }
    async fetch(options = {}) {
        const model = await this.getFetchPromise();
        if (model == null && options.throws !== false) {
            const message = `${this.Model.name} with ID ${this.id} not found`;
            throw this.options.notFoundError?.(message) ?? new Error(message);
        }
        if (model != null) {
            this.options.onFetch?.(model);
        }
        return model;
    }
    fetchPromise;
    getFetchPromise() {
        if (this.fetchPromise !== undefined) {
            return this.fetchPromise;
        }
        if (this.options.fetch != null) {
            this.fetchPromise = wrapInPromise(this.options.fetch());
        }
        else {
            let query = this.Model.query();
            if (this.options.filter) {
                query = this.options.filter(query);
            }
            this.fetchPromise = wrapInPromise(query.get(this.id));
        }
        this.fetchPromise.finally(() => {
            delete this.fetchPromise;
        });
        return this.fetchPromise;
    }
    replace(model) {
        this.model = model;
    }
    //------
    // Freeing
    free() {
        if (this.model != null) {
            this.options.onFree?.(this.model);
            this.options.logger?.debug(chalk `{red Freed {yellow ${this.Model.name} ${this.id}}}`);
        }
        this.model = null;
    }
}
