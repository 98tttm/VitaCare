const mongoose = require('mongoose');

async function main() {
    try {
        await mongoose.connect('mongodb://localhost:27019/VitaCare');
        const db = mongoose.connection.db;

        const coll = db.collection('blog');
        const docs = await coll.find({ tags: { $exists: true, $not: { $size: 0 } } }).limit(5).toArray();

        docs.forEach((doc, i) => {
            console.log(`Blog ${i + 1}: ${doc.title}`);
            console.log('Tags:', JSON.stringify(doc.tags, null, 2));
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
