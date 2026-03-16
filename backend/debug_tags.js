const mongoose = require('mongoose');

async function main() {
    try {
        await mongoose.connect('mongodb://localhost:27019/VitaCare');
        const db = mongoose.connection.db;

        const coll = db.collection('blog');
        const doc = await coll.findOne({ tags: { $exists: true, $not: { $size: 0 } } });

        if (doc) {
            console.log('--- BLOG TAGS SAMPLE ---');
            console.log(JSON.stringify(doc.tags, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
