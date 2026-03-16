const mongoose = require('mongoose');

async function main() {
    try {
        await mongoose.connect('mongodb://localhost:27019/VitaCare');
        const db = mongoose.connection.db;

        const coll = db.collection('blog');
        const doc = await coll.findOne({ tags: { $exists: true, $not: { $size: 0 } } });

        if (doc) {
            console.log('Blog with tags:', doc.title);
            console.log('Tags structure:', JSON.stringify(doc.tags, null, 2));
        } else {
            console.log('No blog with tags found in "blog" collection.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
