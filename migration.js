// --- START OF FILE migration.js ---

const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// <<< CHÚ Ý: Đảm bảo biến môi trường MONGODB_URI đã được thiết lập trên Render >>>
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("Lỗi: Biến môi trường MONGODB_URI chưa được thiết lập!");
    process.exit(1);
}

// <<< CHÚ Ý: Đường dẫn này PHẢI TRÙNG KHỚP với Mount Path trên Render >>>
const UPLOADS_DIR = '/var/data/uploads';

// --- Định nghĩa lại Schema để script có thể hiểu được cấu trúc dữ liệu ---
const lobbySchema = new mongoose.Schema({ name: String, logo_url: String });
const gameSchema = new mongoose.Schema({ lobby_id: mongoose.Schema.Types.ObjectId, name: String, image_url: String });
const Lobby = mongoose.model('Lobby', lobbySchema);
const Game = mongoose.model('Game', gameSchema);

// --- Hàm chính để thực hiện di chuyển dữ liệu ---
async function migrateImages() {
    console.log("--- BẮT ĐẦU QUÁ TRÌNH DI CHUYỂN ẢNH TỪ CLOUDINARY VỀ RENDER DISK ---");
    
    // Đảm bảo thư mục lưu trữ tồn tại
    if (!fs.existsSync(UPLOADS_DIR)){
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        console.log(`Đã tạo thư mục lưu trữ: ${UPLOADS_DIR}`);
    }

    // Kết nối đến MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("Đã kết nối thành công đến MongoDB.");

    // Xử lý các sảnh (Lobbies)
    const lobbies = await Lobby.find({ logo_url: { $regex: /cloudinary/, $options: 'i' } });
    console.log(`\nTìm thấy ${lobbies.length} sảnh game cần di chuyển logo...`);
    for (const lobby of lobbies) {
        await processDocument(lobby, 'logo_url', 'lobby-logo');
    }

    // Xử lý các game (Games)
    const games = await Game.find({ image_url: { $regex: /cloudinary/, $options: 'i' } });
    console.log(`\nTìm thấy ${games.length} game cần di chuyển ảnh...`);
    for (const game of games) {
        await processDocument(game, 'image_url', 'game-image');
    }

    console.log("\n--- QUÁ TRÌNH DI CHUYỂN ĐÃ HOÀN TẤT! ---");
    await mongoose.disconnect();
}

// --- Hàm xử lý cho từng document (game hoặc lobby) ---
async function processDocument(doc, urlField, fieldNamePrefix) {
    const cloudinaryUrl = doc[urlField];
    if (!cloudinaryUrl) {
        console.log(` -> Bỏ qua document ID ${doc._id} vì không có URL.`);
        return;
    }

    try {
        console.log(` -> Đang xử lý: ${doc.name} (ID: ${doc._id})`);
        console.log(`    Tải xuống từ: ${cloudinaryUrl}`);

        // Tải ảnh từ URL
        const response = await axios({
            url: cloudinaryUrl,
            method: 'GET',
            responseType: 'stream'
        });

        // Tạo tên file mới và đường dẫn lưu
        const originalExtension = path.extname(new URL(cloudinaryUrl).pathname) || '.png';
        const newFilename = `${fieldNamePrefix}-${doc._id}-${Date.now()}${originalExtension}`;
        const newFilePath = path.join(UPLOADS_DIR, newFilename);

        // Lưu file vào disk
        const writer = fs.createWriteStream(newFilePath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        console.log(`    Lưu thành công vào: ${newFilePath}`);

        // Cập nhật đường dẫn mới trong DB
        const newRelativeUrl = `/uploads/${newFilename}`;
        doc[urlField] = newRelativeUrl;
        await doc.save();
        
        console.log(`    Cập nhật DB thành công với URL mới: ${newRelativeUrl}`);

    } catch (error) {
        console.error(`    !!! Lỗi khi xử lý document ID ${doc._id}: ${error.message}`);
    }
}

// --- Chạy hàm di chuyển ---
migrateImages().catch(err => {
    console.error("\n!!! ĐÃ XẢY RA LỖI NGHIÊM TRỌNG TRONG QUÁ TRÌNH DI CHUYỂN:", err);
    mongoose.disconnect();
    process.exit(1);
});