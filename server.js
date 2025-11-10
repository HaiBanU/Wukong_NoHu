// --- PHẦN 1: KHAI BÁO VÀ THIẾT LẬP (Giữ nguyên) ---
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();
const port = 3000;

let lobbyRatesCache = {};
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'troll_tool',
        allowedFormats: ['jpeg', 'png', 'jpg', 'gif']
    },
});

const upload = multer({ storage: storage });

// --- PHẦN 2: KẾT NỐI DATABASE VÀ ĐỊNH NGHĨA MODELS ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to the MongoDB database.');
        createSuperAdmin(); // Sửa tên hàm
    })
    .catch(err => {
        console.error('Could not connect to MongoDB...', err)
    });

// === THAY ĐỔI: Thêm is_super_admin để phân biệt Admin tổng và Admin phụ ===
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false },
    is_super_admin: { type: Boolean, default: false }, // Thêm trường mới
    managed_by_admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

const lobbySchema = new mongoose.Schema({
    name: String,
    logo_url: String,
    position: { type: Number, default: 0 }
});

const gameSchema = new mongoose.Schema({
    lobby_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lobby', required: true },
    name: String,
    image_url: String
});

const User = mongoose.model('User', userSchema);
const Lobby = mongoose.model('Lobby', lobbySchema);
const Game = mongoose.model('Game', gameSchema);

// === THAY ĐỔI: Chỉ tạo một Super Admin duy nhất ===
async function createSuperAdmin() {
    const superAdminUsername = 'admin'; // Tên tài khoản Admin Tổng
    try {
        const existingAdmin = await User.findOne({ username: superAdminUsername });
        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await new User({
                username: superAdminUsername,
                password: hashedPassword,
                is_admin: true,
                is_super_admin: true // Đánh dấu đây là Admin Tổng
            }).save();
            console.log(`Super Admin account created: user='${superAdminUsername}'`);
        }
    } catch (error) {
        console.error(`Error creating Super Admin:`, error.message);
    }
}


// --- PHẦN 3: CÁC API ENDPOINTS ---

// API Đăng ký
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'Tên đăng nhập và mật khẩu không được để trống' });
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ username, password: hashedPassword }).save();
        res.json({ success: true, message: 'Đăng ký thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo tài khoản' });
    }
});

// === THAY ĐỔI: API Đăng nhập trả về thêm isSuperAdmin ===
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Tên đăng nhập không tồn tại' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            res.json({
                success: true,
                message: 'Đăng nhập thành công!',
                isAdmin: user.is_admin,
                isSuperAdmin: user.is_super_admin, // Trả về thông tin admin tổng
                userId: user.is_admin ? user._id : null
            });
        } else {
            res.status(401).json({ success: false, message: 'Mật khẩu không chính xác' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// API lấy người dùng theo admin
app.get('/api/users', async (req, res) => {
    try {
        const { admin_id } = req.query;
        if (!admin_id) return res.status(400).json({ success: false, message: "Thiếu thông tin admin." });
        const users = await User.find({ managed_by_admin_id: admin_id }).select('_id username coins');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});

// API gán user cho admin
app.post('/api/link-user', async (req, res) => {
    try {
        const { adminId, username } = req.body;
        if (!adminId || !username) return res.status(400).json({ success: false, message: "Vui lòng nhập tên tài khoản." });
        const user = await User.findOne({ username, is_admin: false });
        if (!user) return res.status(404).json({ success: false, message: `Tài khoản "${username}" không tồn tại.` });
        if (user.managed_by_admin_id) return res.status(409).json({ success: false, message: `Tài khoản "${username}" đã được quản lý bởi một admin khác.` });
        await User.updateOne({ _id: user._id }, { $set: { managed_by_admin_id: adminId } });
        res.json({ success: true, message: `Thêm tài khoản "${username}" thành công!` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi cập nhật." });
    }
});

// API xóa user
app.post('/api/delete-user', async (req, res) => {
    try {
        const { userId, adminId } = req.body;
        if (!userId || !adminId) return res.status(400).json({ success: false, message: "Thiếu thông tin." });
        const result = await User.deleteOne({ _id: userId, managed_by_admin_id: adminId });
        if (result.deletedCount === 0) return res.status(403).json({ success: false, message: "Không có quyền xóa user này hoặc user không tồn tại." });
        res.json({ success: true, message: "Xóa người dùng thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});


// === THAY ĐỔI: Logic cập nhật Token của Admin phụ cho User ===
app.post('/api/update-coins', async (req, res) => {
    try {
        const { userId, coins, adminId } = req.body; // Cần adminId để trừ tiền
        if (!adminId) return res.status(400).json({ success: false, message: "Thiếu thông tin Admin." });

        const numCoins = parseInt(coins, 10);
        if (isNaN(numCoins) || numCoins < 0) return res.status(400).json({ success: false, message: "Số Token không hợp lệ." });

        const admin = await User.findById(adminId);
        const user = await User.findById(userId);

        if (!admin || !user) return res.status(404).json({ success: false, message: "Không tìm thấy Admin hoặc User." });

        const oldUserCoins = user.coins;
        const coinDifference = numCoins - oldUserCoins;

        // Nếu admin không phải super admin, thì kiểm tra và trừ tiền
        if (!admin.is_super_admin) {
            if (admin.coins < coinDifference) {
                return res.status(400).json({ success: false, message: `Không đủ Token. Bạn chỉ còn ${admin.coins} Token.` });
            }
            admin.coins -= coinDifference;
            await admin.save();
        }
        
        user.coins = numCoins;
        await user.save();
        
        res.json({ success: true, message: "Cập nhật Token thành công!" });

    } catch (error) {
        console.error("Update coins error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi cập nhật Token." });
    }
});


// === THÊM MỚI: API cho Super Admin quản lý Admin phụ ===

// API lấy danh sách các Admin phụ
app.get('/api/sub-admins', async (req, res) => {
    try {
        const subAdmins = await User.find({ is_admin: true, is_super_admin: false }).select('_id username coins');
        res.json({ success: true, admins: subAdmins });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách admin." });
    }
});

// API tạo Admin phụ mới
app.post('/api/create-sub-admin', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'Tên đăng nhập và mật khẩu không được để trống' });

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({
            username,
            password: hashedPassword,
            is_admin: true,
            is_super_admin: false // Quan trọng: Đánh dấu là admin phụ
        }).save();
        
        res.json({ success: true, message: `Tạo tài khoản Admin '${username}' thành công!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo tài khoản' });
    }
});

// API Super Admin cấp Token cho Admin phụ
app.post('/api/grant-coins-to-admin', async (req, res) => {
    try {
        const { adminId, amount } = req.body;
        const numAmount = parseInt(amount, 10);

        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: "Số Token cấp phải là một số dương." });
        }

        const adminToUpdate = await User.findById(adminId);
        if (!adminToUpdate || !adminToUpdate.is_admin || adminToUpdate.is_super_admin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản Admin phụ hợp lệ." });
        }

        adminToUpdate.coins += numAmount;
        await adminToUpdate.save();
        
        res.json({ success: true, message: `Cấp ${numAmount} Token cho ${adminToUpdate.username} thành công. Số dư mới: ${adminToUpdate.coins}` });

    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi cấp Token." });
    }
});

// API Xóa Admin phụ
app.post('/api/delete-sub-admin', async (req, res) => {
    try {
        const { adminId } = req.body;
        if (!adminId) return res.status(400).json({ success: false, message: "Thiếu thông tin." });
        
        // Cập nhật tất cả user do admin này quản lý về trạng thái chưa được quản lý
        await User.updateMany({ managed_by_admin_id: adminId }, { $set: { managed_by_admin_id: null } });

        // Xóa admin
        const result = await User.deleteOne({ _id: adminId, is_super_admin: false });

        if (result.deletedCount === 0) return res.status(404).json({ success: false, message: "Không tìm thấy admin phụ để xóa." });
        
        res.json({ success: true, message: "Xóa Admin phụ thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});

// API thêm sảnh game
app.post('/api/add-lobby', upload.single('logo'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh logo.' });
        const logoUrl = req.file.path;
        await new Lobby({ name, logo_url: logoUrl }).save();
        res.json({ success: true, message: 'Thêm sảnh thành công!' });
    } catch (error) {
        console.error("Lỗi khi thêm sảnh:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm sảnh.' });
    }
});

// API thêm game
app.post('/api/add-game', upload.single('image'), async (req, res) => {
    try {
        const { lobby_id, name } = req.body;
        if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh game.' });
        const imageUrl = req.file.path;
        await new Game({ lobby_id, name, image_url: imageUrl }).save();
        delete lobbyRatesCache[lobby_id];
        res.json({ success: true, message: 'Thêm game thành công!' });
    } catch (error) {
        console.error("Lỗi khi thêm game:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm game.' });
    }
});

// API lấy thông tin user (bao gồm cả admin)
app.get('/api/user-info', async (req, res) => {
    try {
        const { username } = req.query;
        const userInfo = await User.findOne({ username }).select('username coins');
        if (!userInfo) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
        res.json({ success: true, userInfo });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});

// API lấy danh sách sảnh
app.get('/api/lobbies', async (req, res) => {
    try {
        const lobbies = await Lobby.find({}).sort({ position: 1, _id: 1 });
        res.json({ success: true, lobbies });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});

// API cập nhật thứ tự sảnh
app.post('/api/update-lobby-order', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ." });
        }
        const updates = orderedIds.map((id, index) => ({
            updateOne: { filter: { _id: id }, update: { $set: { position: index } } }
        }));
        await Lobby.bulkWrite(updates);
        res.json({ success: true, message: 'Cập nhật thứ tự sảnh thành công!' });
    } catch (error) {
        console.error("Lỗi khi cập nhật thứ tự sảnh:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi cập nhật thứ tự." });
    }
});

// API lấy game với tỷ lệ random
app.get('/api/games-with-rates', async (req, res) => {
    try {
        const { lobby_id } = req.query;
        if (!lobby_id) return res.status(400).json({ success: false, message: "Thiếu ID của sảnh" });
        const now = Date.now();
        const cachedData = lobbyRatesCache[lobby_id];
        if (cachedData && (now - cachedData.timestamp < ONE_HOUR_IN_MS)) {
            return res.json({ success: true, games: cachedData.games });
        }
        const games = await Game.find({ lobby_id }).lean();
        if (games.length > 0) {
            let gamesWithRates = games.map(game => ({ ...game, winRate: Math.floor(Math.random() * (85 - 30 + 1)) + 30 }));
            const highRateCount = games.length > 1 ? (Math.random() < 0.5 ? 1 : 2) : 1;
            const indices = [...Array(games.length).keys()].sort(() => 0.5 - Math.random());
            for (let i = 0; i < highRateCount; i++) {
                gamesWithRates[indices[i]].winRate = Math.floor(Math.random() * (95 - 86 + 1)) + 86;
            }
            gamesWithRates.sort((a, b) => b.winRate - a.winRate);
            lobbyRatesCache[lobby_id] = { timestamp: now, games: gamesWithRates };
            res.json({ success: true, games: gamesWithRates });
        } else {
            res.json({ success: true, games: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});

// API lấy danh sách game theo sảnh
app.get('/api/games', async (req, res) => {
    try {
        const { lobby_id } = req.query;
        if (!lobby_id) return res.status(400).json({ success: false, message: "Thiếu ID của sảnh" });
        const games = await Game.find({ lobby_id });
        res.json({ success: true, games });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi lấy game" });
    }
});

// API xóa game
app.post('/api/delete-game', async (req, res) => {
    try {
        const { gameId } = req.body;
        if (!gameId) return res.status(400).json({ success: false, message: "Thiếu ID của game." });
        const gameToDelete = await Game.findById(gameId);
        if (!gameToDelete) return res.status(404).json({ success: false, message: "Không tìm thấy game để xóa." });
        await Game.findByIdAndDelete(gameId);
        delete lobbyRatesCache[gameToDelete.lobby_id];
        res.json({ success: true, message: "Xóa game thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi xóa game." });
    }
});

// API phân tích game
app.post('/api/analyze-game', async (req, res) => {
    try {
        const { username, winRate } = req.body;
        if (!username || !winRate) return res.status(400).json({ success: false, message: "Thiếu thông tin để phân tích." });
        const ANALYSIS_COST = 4;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        if (user.coins < ANALYSIS_COST) return res.json({ success: false, message: `Không đủ Token! Bạn cần ${ANALYSIS_COST} Token để phân tích.` });
        const newCoinBalance = user.coins - ANALYSIS_COST;
        await User.updateOne({ _id: user._id }, { $set: { coins: newCoinBalance } });
        const baseRate = parseInt(winRate, 10);
        const boostedRate = Math.floor(Math.random() * (98 - baseRate + 1)) + baseRate;
        const finalAnalysisResult = Math.min(98, boostedRate);
        res.json({ success: true, message: "Phân tích thành công!", newCoinBalance, analysisResult: finalAnalysisResult });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi phân tích." });
    }
});


// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});