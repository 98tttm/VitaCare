const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://localhost:27019/VitaCare';

async function inspect() {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    console.log('--- tree_complete keys ---');
    const loc = await db.collection('tree_complete').findOne();
    if (loc) console.log(Object.keys(loc));

    console.log('--- storesystem_full keys ---');
    const store = await db.collection('storesystem_full').findOne();
    if (store) console.log(Object.keys(store));

    console.log('--- quiz keys ---');
    const quiz = await db.collection('quiz').findOne();
    if (quiz) console.log(Object.keys(quiz));

    await mongoose.connection.close();
}
inspect();
