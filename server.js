// --- PHẦN 1: KHAI BÁO VÀ THIẾT LẬP ---
const express = require('express');
const mongoose = require('mongoose'); // THAY THẾ sqlite3
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
require('dotenv').config(); // Để đọc file .env

const app = express();
const port = 3000;

// BIẾN Dùng để lưu cache tỷ lệ game theo từng sảnh
let lobbyRatesCache = {};
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cấu hình Multer để lưu file (Sẽ thay đổi ở Bước 3)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
    }
});
const upload = multer({ storage: storage });


// --- PHẦN 2: KẾT NỐI DATABASE VÀ ĐỊNH NGHĨA MODELS ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to the MongoDB database.');
        createDefaultAdmins(); // Gọi hàm tạo admin sau khi kết nối thành công
    })
    .catch(err => {
        console.error('Could not connect to MongoDB...', err)
    });

// Định nghĩa Schemas (Cấu trúc dữ liệu cho MongoDB)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false },
    managed_by_admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

const lobbySchema = new mongoose.Schema({
    name: String,
    logo_url: String
});

const gameSchema = new mongoose.Schema({
    lobby_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lobby', required: true },
    name: String,
    image_url: String
});

// Tạo Models từ Schemas
const User = mongoose.model('User', userSchema);
const Lobby = mongoose.model('Lobby', lobbySchema);
const Game = mongoose.model('Game', gameSchema);


// Hàm tạo Admin mặc định (VIẾT LẠI DÙNG MONGOOSE)
async function createDefaultAdmins() {
    const defaultAdmins = [
        { username: 'admin',      password: 'admin123' },
        { username: 'hai',        password: '1' },
        { username: 'support01',  password: 'another_secure_password' }
    ];
    for (const adminAccount of defaultAdmins) {
        try {
            const existingAdmin = await User.findOne({ username: adminAccount.username });
            if (!existingAdmin) {
                const hashedPassword = await bcrypt.hash(adminAccount.password, 10);
                await new User({
                    username: adminAccount.username,
                    password: hashedPassword,
                    is_admin: true
                }).save();
                console.log(`Default admin account created: user='${adminAccount.username}'`);
            }
        } catch (error) {
            console.error(`Error creating admin '${adminAccount.username}':`, error.message);
        }
    }
}


// --- PHẦN 3: CÁC API ENDPOINTS (ĐÃ CHUYỂN SANG MONGOOSE) ---

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

// API Đăng nhập
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
                userId: user.is_admin ? user._id : null // MongoDB dùng _id
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

        const users = await User.find({ managed_by_admin_id: admin_id }).select('username coins');
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

// API cập nhật Token
app.post('/api/update-coins', async (req, res) => {
    try {
        const { userId, coins } = req.body;
        const numCoins = parseInt(coins, 10);
        if (isNaN(numCoins) || numCoins < 0) return res.status(400).json({ success: false, message: "Số Token không hợp lệ." });
        
        await User.findByIdAndUpdate(userId, { coins: numCoins });
        res.json({ success: true, message: "Cập nhật Token thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});

// API thêm sảnh game
app.post('/api/add-lobby', upload.single('logo'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh logo.' });
        
        const logoUrl = '/uploads/' + req.file.filename;
        await new Lobby({ name, logo_url: logoUrl }).save();
        res.json({ success: true, message: 'Thêm sảnh thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm sảnh.' });
    }
});

// API thêm game
app.post('/api/add-game', upload.single('image'), async (req, res) => {
    try {
        const { lobby_id, name } = req.body;
        if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh game.' });
        
        const imageUrl = '/uploads/' + req.file.filename;
        await new Game({ lobby_id, name, image_url: imageUrl }).save();
        res.json({ success: true, message: 'Thêm game thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm game.' });
    }
});

// API lấy thông tin user
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
        const lobbies = await Lobby.find({}).sort({ _id: -1 });
        res.json({ success: true, lobbies });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});

// API LẤY GAME VỚI TỶ LỆ RANDOM (CHO USER)
app.get('/api/games-with-rates', async (req, res) => {
    try {
        const { lobby_id } = req.query;
        if (!lobby_id) return res.status(400).json({ success: false, message: "Thiếu ID của sảnh" });

        const now = Date.now();
        const cachedData = lobbyRatesCache[lobby_id];

        if (cachedData && (now - cachedData.timestamp < ONE_HOUR_IN_MS)) {
            return res.json({ success: true, games: cachedData.games });
        }

        const games = await Game.find({ lobby_id }).lean(); // .lean() để lấy object thuần túy, nhanh hơn
        if (games.length > 0) {
            let gamesWithRates = games.map(game => ({
                ...game,
                winRate: Math.floor(Math.random() * (85 - 30 + 1)) + 30
            }));

            // Logic random tỷ lệ cao giữ nguyên
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


// API Lấy danh sách game theo sảnh (Dành cho trang Admin)
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

// API Xóa một game
app.post('/api/delete-game', async (req, res) => {
    try {
        const { gameId } = req.body;
        if (!gameId) return res.status(400).json({ success: false, message: "Thiếu ID của game." });

        const result = await Game.findByIdAndDelete(gameId);
        if (!result) return res.status(404).json({ success: false, message: "Không tìm thấy game để xóa." });
        
        res.json({ success: true, message: "Xóa game thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi xóa game." });
    }
});

// API PHÂN TÍCH GAME
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

        res.json({
            success: true,
            message: "Phân tích thành công!",
            newCoinBalance,
            analysisResult: finalAnalysisResult
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi phân tích." });
    }
});

// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});