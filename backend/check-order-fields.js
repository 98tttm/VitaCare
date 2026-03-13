const { connectDB, mongoose } = require('./db');
async function test() {
  await connectDB();
  const order = await mongoose.connection.db.collection('orders').findOne({});
  console.log("Full Order Sample:", JSON.stringify(order, null, 2));
  process.exit();
}
test();
