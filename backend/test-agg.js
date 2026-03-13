const { connectDB, mongoose } = require('./db');
const { Schema } = mongoose;
const genericSchema = new Schema({}, { strict: false, timestamps: true });
const OrderModel = mongoose.model('temp_orders', genericSchema, 'orders');

async function test() {
  await connectDB();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60); // broader for testing
  
  const results = await OrderModel.aggregate([
    { $addFields: {
        rawDate: { $ifNull: ["$createdAt", "$route.pending"] }
    }},
    { $addFields: {
        parsedDate: { $toDate: "$rawDate" }
    }},
    { $match: { 
        parsedDate: { $gte: thirtyDaysAgo },
        $or: [{ statusPayment: 'paid' }, { status: 'delivered' }]
    }},
    { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$parsedDate" } },
        revenue: { $sum: "$totalAmount" },
        count: { $sum: 1 }
    }},
    { $sort: { _id: 1 } }
  ]);
  
  console.log("Aggregation Results:", JSON.stringify(results, null, 2));
  process.exit();
}
test();
