const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27019/VitaCare').then(async () => {
    const db = mongoose.connection.db;
    for (const name of ['blog', 'blogs']) {
        const coll = db.collection(name);
        const count = await coll.countDocuments();
        console.log(`Collection: ${name}, Count: ${count}`);
        if (count > 0) {
            const docs = await coll.find({}, { projection: { category: 1, categories: 1, categoryName: 1 } }).limit(5).toArray();
            console.log(`Sample docs from ${name}:`, JSON.stringify(docs, null, 2));
        }
    }
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
