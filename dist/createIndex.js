export async function createIndex(collection, name, keys, options = {}) {
    try {
        await collection.createIndex(keys, options);
    }
    catch (error) {
        if (error.codeName === 'IndexOptionsConflict') {
            // This we can solve by dropping & recreating the index.
            await collection.dropIndex(name);
            await collection.createIndex(keys, options);
        }
        else {
            throw error;
        }
    }
}
