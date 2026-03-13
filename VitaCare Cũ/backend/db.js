const mongoose = require('mongoose');

// MongoDB connection configuration
const MONGODB_URI = 'mongodb://localhost:27019/VitaCare';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Kết nối MongoDB thành công!');
        console.log(`📊 Database: VitaCare`);
        console.log(`🔌 Port: 27019`);
    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error.message);
        process.exit(1);
    }
};

// Xử lý sự kiện kết nối
mongoose.connection.on('connected', () => {
    console.log('Mongoose đã kết nối với MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose lỗi kết nối:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose đã ngắt kết nối');
});

// Xử lý tắt ứng dụng
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('Đã đóng kết nối MongoDB');
    process.exit(0);
});

module.exports = { connectDB, mongoose };
