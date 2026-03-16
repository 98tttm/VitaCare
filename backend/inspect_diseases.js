const { connectDB, mongoose } = require('./db');
const { Schema } = mongoose;

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    // Check collections
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    const candidates = ['benh', 'diseases'];
    let targetCol = null;
    for (const name of candidates) {
        if (collections.find(c => c.name === name)) {
            targetCol = db.collection(name);
            console.log(`Using collection: ${name}`);
            break;
        }
    }

    if (!targetCol) {
        console.log('No disease collection found');
        process.exit(1);
    }

    // Sample document
    const sample = await targetCol.findOne({});
    console.log('Sample Document:', JSON.stringify(sample, null, 2));

    // Count by bodyPart field if it exists
    const bodyPartCounts = await targetCol.aggregate([
        { $group: { _id: '$bodyPart', count: { $sum: 1 } } }
    ]).toArray();
    console.log('Counts by bodyPart field:', bodyPartCounts);

    // Count by categories.fullPathSlug
    const groupCounts = await targetCol.aggregate([
        { $unwind: '$categories' },
        { $group: { _id: '$categories.fullPathSlug', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log('Top Category Patterns:', groupCounts.slice(0, 20));

    process.exit(0);
}

inspect();
