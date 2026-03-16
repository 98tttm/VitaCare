const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27019/VitaCare').then(async () => {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    const categoryCol = db.collection('categories');
    const categories = await categoryCol.find({}, { projection: { name: 1, slug: 1, parentId: 1, level: 1 } }).toArray();
    console.log('Categories:', JSON.stringify(categories, null, 2));

    const blogCol = db.collection('blogs');
    const blogs = await blogCol.find({}, { projection: { title: 1, slug: 1 } }).limit(20).toArray();
    console.log('Blogs Sample:', JSON.stringify(blogs, null, 2));

    const diseaseCol = db.collection('diseases');
    const diseases = await diseaseCol.find({}, { projection: { name: 1, slug: 1 } }).limit(20).toArray();
    console.log('Diseases Sample:', JSON.stringify(diseases, null, 2));

    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
