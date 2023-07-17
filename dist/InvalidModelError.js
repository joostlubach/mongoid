import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { sparse } from 'ytil';
export default class InvalidModelError extends Error {
    constructor(Model, result) {
        const message = stripAnsi(InvalidModelError.description(Model, result));
        super(message);
        this.Model = Model;
        this.result = result;
    }
    Model;
    result;
    get errors() {
        return this.result.errors;
    }
    toJSON() {
        return {
            message: this.message,
            result: this.result,
        };
    }
    static description(Model, result, pretty = false) {
        let description = chalk `{red.underline Invalid model {yellow \`${Model.name}\`}:}`;
        if (pretty) {
            description += '\n';
        }
        for (const { path, code, message } of result.errors) {
            description += sparse([
                '  - ',
                path != null && chalk `{yellow ${path}}:`,
                code != null && chalk `{red [${code}]}`,
                message != null && chalk `{red.dim ${message}}`,
            ]).join(' ');
            if (pretty) {
                description += '\n';
            }
        }
        return description;
    }
    printFriendly() {
        const message = InvalidModelError.description(this.Model, this.result, true);
        process.stderr.write(message);
    }
}
