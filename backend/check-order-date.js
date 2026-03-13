const { connectDB, mongoose } = require('./db');
async function test() {
  await connectDB();
  const order = await mongoose.connection.db.collection('orders').findOne({});
  console.log("Order Date Sample:", order.createdAt, typeof order.createdAt);
  process.exit();
}
test();
