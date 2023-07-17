import chalk from 'chalk';
import { MongoClient } from 'mongodb';
import URL from 'url';
import config from './config';
const stub = new Proxy({}, {
    get() {
        throw new Error(`No connection made yet`);
    },
});
let CLIENT = stub;
let DB = stub;
export default function () {
    if (DB == null) {
        throw new Error("Not yet connected");
    }
    return DB;
}
export function getClient() {
    if (CLIENT == null) {
        throw new Error("Not yet connected");
    }
    return CLIENT;
}
export async function connect(uri) {
    const client = await MongoClient.connect(uri, {
        useUnifiedTopology: true,
    });
    const url = URL.parse(uri);
    const dbName = url.pathname.slice(1);
    CLIENT = client;
    DB = client.db(dbName);
    config.logger.info(chalk.dim(`Connected to ${uri}`));
}
export function disconnect() {
    CLIENT.close();
    config.logger.debug(chalk.dim("Connection closed"));
}
export function connected() {
    return CLIENT !== stub && DB !== stub;
}
