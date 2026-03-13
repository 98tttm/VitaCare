const mongoose = require('mongoose');
const Review = require('./models/Review');
const { connectDB } = require('./db');

connectDB();

async function check() {
    try {
        // Find review containing the specific text from the screenshot
        const docs = await Review.find({ "reviews.content": /Sản phẩm hiệu quả/ });

        docs.forEach(doc => {
            console.log(`SKU: ${doc.sku}`);
            doc.reviews.forEach(r => {
                if (r.content.includes("Sản phẩm hiệu quả")) {
                    console.log(`Reviewer: ${r.fullname}`);
                    console.log(`Likes:`, r.likes);
                }
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
}

check();
