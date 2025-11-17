// --- PHẦN 1: KHAI BÁO VÀ THIẾT LẬP ---
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

let lobbyRatesCache = {};
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const gameBrands = [
    { name: 'AU88', logo: 'au88.png' },
    { name: 'MB66', logo: 'mb66.png' },
    { name: 'MM88', logo: 'mm88.png' },
    { name: 'RR88', logo: 'rr88.png' },
    { name: 'XX88', logo: 'xx88.png' },
    { name: 'QH88', logo: 'qh88.png' },
    { name: 'F8BET', logo: 'f8bet.png' },
    { name: 'SHBET', logo: 'shbet.png' },
    { name: '188BET', logo: '188bet.png' },
    { name: 'W88', logo: 'w88.png' },
    { name: '788WIN', logo: '788win.png' },
    { name: 'BK88', logo: 'bk88.png' },
    { name: 'FLY88', logo: 'fly88.png' },
    { name: 'QQ88', logo: 'qq88.png' }
];

app.use(cors());
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
    params: { folder: 'troll_tool', allowedFormats: ['jpeg', 'png', 'jpg', 'gif'] },
});
const upload = multer({ storage: storage });

mongoose.connect(process.env.MONGODB_URI)
    .then(() => { 
        console.log('Connected to the MongoDB database.'); 
        createSuperAdmin();
        migrateOrphanedSubAdmins(); // Chạy hàm sửa dữ liệu
    })
    .catch(err => console.error('Could not connect to MongoDB...', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false },
    is_super_admin: { type: Boolean, default: false },
    managed_by_admin_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assigned_brand: { type: String, default: null },
    coins_by_brand: { type: Map, of: Number, default: {} },
    created_by_super_admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
}, { timestamps: true });

const lobbySchema = new mongoose.Schema({ name: String, logo_url: String, position: { type: Number, default: 0 } });
const gameSchema = new mongoose.Schema({ lobby_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lobby', required: true }, name: String, image_url: String });
const User = mongoose.model('User', userSchema);
const Lobby = mongoose.model('Lobby', lobbySchema);
const Game = mongoose.model('Game', gameSchema);

async function createSuperAdmin() {
    // === CẬP NHẬT: Sửa 'admin' thành 'longho' ===
    const superAdmins = [
        { username: 'longho', password: '173204' }, // <<< ĐÃ SỬA
        { username: 'vylaobum4', password: '0354089235' }
    ];
    try {
        for (const admin of superAdmins) {
            const existingAdmin = await User.findOne({ username: admin.username });
            if (!existingAdmin) {
                const hashedPassword = await bcrypt.hash(admin.password, 10);
                await new User({
                    username: admin.username,
                    password: hashedPassword,
                    is_admin: true,
                    is_super_admin: true
                }).save();
                console.log(`Super Admin account created: user='${admin.username}'`);
            }
        }
    } catch (error) {
        console.error(`Error creating Super Admin:`, error.message);
    }
}

// === CẬP NHẬT: Gán các admin phụ cũ cho super admin 'longho' ===
async function migrateOrphanedSubAdmins() {
    try {
        // 1. Tìm tài khoản Super Admin gốc (là 'longho')
        const originalSuperAdmin = await User.findOne({ username: 'longho', is_super_admin: true }); // <<< ĐÃ SỬA

        if (!originalSuperAdmin) {
            console.log("Migration script: Original Super Admin ('longho') not found. Skipping migration."); // <<< ĐÃ SỬA
            return;
        }

        // 2. Tìm tất cả admin phụ chưa có người tạo và gán cho tài khoản 'longho'
        const result = await User.updateMany(
            {
                is_admin: true,
                is_super_admin: false,
                created_by_super_admin_id: null
            },
            {
                $set: { created_by_super_admin_id: originalSuperAdmin._id }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`Migration successful: Assigned ${result.modifiedCount} orphaned sub-admin(s) to '${originalSuperAdmin.username}'.`); // <<< ĐÃ SỬA
        } else {
            console.log("Migration script: No orphaned sub-admins found to update.");
        }
    } catch (error) {
        console.error("Error during sub-admin migration:", error.message);
    }
}


// --- PHẦN 3: CÁC API ENDPOINTS ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Tên đăng nhập và mật khẩu không được để trống' });
        }
        if (username.length <= 4) {
            return res.status(400).json({ success: false, message: 'Tên đăng nhập phải có nhiều hơn 4 ký tự' });
        }
        if (password.length <= 6) {
            return res.status(400).json({ success: false, message: 'Mật khẩu phải có nhiều hơn 6 ký tự' });
        }
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ username, password: hashedPassword }).save();
        res.json({ success: true, message: 'Đăng ký thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo tài khoản' });
    }
});

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
                isSuperAdmin: user.is_super_admin,
                userId: user.is_admin ? user._id : null
            });
        } else {
            res.status(401).json({ success: false, message: 'Mật khẩu không chính xác' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

app.get('/api/brands', (req, res) => {
    res.json({ success: true, brands: gameBrands });
});

app.get('/api/user-info', async (req, res) => {
    try {
        const { username } = req.query;
        const userInfo = await User.findOne({ username }).select('username coins coins_by_brand assigned_brand');
        if (!userInfo) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
        res.json({ success: true, userInfo });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});
app.get('/api/users', async (req, res) => {
    try {
        const { admin_id } = req.query;
        if (!admin_id) return res.status(400).json({ success: false, message: "Thiếu thông tin admin." });
        const users = await User.find({ managed_by_admin_ids: admin_id }).select('_id username coins_by_brand');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});

app.post('/api/link-user', async (req, res) => {
    try {
        const { adminId, username } = req.body;
        if (!adminId || !username) return res.status(400).json({ success: false, message: "Vui lòng nhập tên tài khoản." });
        const user = await User.findOne({ username, is_admin: false });
        if (!user) return res.status(404).json({ success: false, message: `Tài khoản "${username}" không tồn tại.` });
        if (user.managed_by_admin_ids.includes(adminId)) {
            return res.status(409).json({ success: false, message: `Tài khoản "${username}" đã có trong danh sách quản lý của bạn.` });
        }
        await User.updateOne({ _id: user._id }, { $push: { managed_by_admin_ids: adminId } });
        res.json({ success: true, message: `Thêm tài khoản "${username}" vào danh sách quản lý thành công!` });
    } catch (error) { 
        res.status(500).json({ success: false, message: "Lỗi server khi cập nhật." });
    }
});

app.post('/api/delete-user', async (req, res) => {
    try {
        const { userId, adminId } = req.body;
        if (!userId || !adminId) return res.status(400).json({ success: false, message: "Thiếu thông tin." });
        
        const result = await User.updateOne(
            { _id: userId },
            { $pull: { managed_by_admin_ids: adminId } }
        );

        if (result.modifiedCount === 0) {
            return res.status(403).json({ success: false, message: "User không có trong danh sách quản lý của bạn." });
        }
        res.json({ success: true, message: "Xóa user khỏi danh sách quản lý thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});

app.post('/api/add-coins-to-user', async (req, res) => {
    try {
        const { userId, amount, adminId } = req.body;
        if (!adminId || !userId) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin Admin hoặc User." });
        }
        const amountToAdd = parseInt(amount, 10);
        if (isNaN(amountToAdd) || amountToAdd === 0) {
            return res.status(400).json({ success: false, message: "Số Token thay đổi không hợp lệ." });
        }
        const admin = await User.findById(adminId);
        const user = await User.findById(userId);
        if (!admin || !user) {
            return res.status(404).json({ success: false, message: "Không tìm thấy Admin hoặc User." });
        }
        const brandName = admin.assigned_brand;
        if (!admin.is_super_admin && !brandName) {
            return res.status(403).json({ success: false, message: "Tài khoản Admin này chưa được gán cho SẢNH GAME nào." });
        }
        if (!admin.is_super_admin && amountToAdd > 0) {
            if (admin.coins < amountToAdd) {
                return res.status(400).json({ success: false, message: `Không đủ Token. Bạn chỉ còn ${admin.coins} Token để cấp.` });
            }
        }
        const currentBrandCoins = user.coins_by_brand.get(brandName) || 0;
        const newCoinBalance = currentBrandCoins + amountToAdd;
        if (newCoinBalance < 0) {
            return res.status(400).json({ success: false, message: "Không thể thu hồi nhiều hơn số Token người dùng đang có." });
        }
        if (!admin.is_super_admin) {
            admin.coins -= amountToAdd;
            await admin.save();
        }
        user.coins_by_brand.set(brandName, newCoinBalance);
        user.markModified('coins_by_brand');
        await user.save();
        const actionText = amountToAdd > 0 ? `Cấp thêm ${amountToAdd}` : `Thu hồi ${-amountToAdd}`;
        res.json({ 
            success: true, 
            message: `${actionText} Token cho ${user.username} thành công!`,
            newTotal: newCoinBalance
        });
    } catch (error) {
        console.error("Add coins error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi cập nhật Token." });
    }
});

app.post('/api/revoke-all-coins-from-user', async (req, res) => {
    try {
        const { userId, adminId } = req.body;
        if (!adminId || !userId) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin Admin hoặc User." });
        }
        const [admin, user] = await Promise.all([
            User.findById(adminId),
            User.findById(userId)
        ]);
        if (!admin || !user) {
            return res.status(404).json({ success: false, message: "Không tìm thấy Admin hoặc User." });
        }
        const brandName = admin.assigned_brand;
        if (!admin.is_super_admin && !brandName) {
            return res.status(403).json({ success: false, message: "Tài khoản Admin này chưa được gán cho SẢNH GAME nào." });
        }
        const coinsToRevoke = user.coins_by_brand.get(brandName) || 0;
        if (coinsToRevoke === 0) {
            return res.status(400).json({ success: false, message: `${user.username} không có Token nào tại sảnh ${brandName} để thu hồi.` });
        }
        if (!admin.is_super_admin) {
            admin.coins += coinsToRevoke;
        }
        user.coins_by_brand.set(brandName, 0);
        user.markModified('coins_by_brand');
        await Promise.all([admin.save(), user.save()]);
        res.json({ 
            success: true, 
            message: `Thu hồi thành công ${coinsToRevoke} Token từ ${user.username} tại sảnh ${brandName}.`,
            revokedAmount: coinsToRevoke
        });
    } catch (error) {
        console.error("Revoke all coins error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi thu hồi Token." });
    }
});

app.get('/api/sub-admins', async (req, res) => {
    try {
        const { creator_id } = req.query;
        if (!creator_id) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin xác thực Super Admin." });
        }
        const subAdmins = await User.find({ 
            is_admin: true, 
            is_super_admin: false,
            created_by_super_admin_id: creator_id
        }).select('_id username coins assigned_brand createdAt');
        res.json({ success: true, admins: subAdmins });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách admin." });
    }
});

app.post('/api/create-sub-admin', async (req, res) => {
    try {
        const { username, password, brandName, creatorId } = req.body;
        if (!username || !password || !brandName || !creatorId) return res.status(400).json({ success: false, message: 'Thiếu thông tin cần thiết (bao gồm ID người tạo).' });
        
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({
            username,
            password: hashedPassword,
            is_admin: true,
            is_super_admin: false,
            assigned_brand: brandName,
            created_by_super_admin_id: creatorId
        }).save();
        res.json({ success: true, message: `Tạo tài khoản Admin '${username}' cho SẢNH GAME ${brandName} thành công!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo tài khoản' });
    }
});
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
app.post('/api/revoke-coins-from-admin', async (req, res) => {
    try {
        const { adminId, amount } = req.body;
        const numAmount = parseInt(amount, 10);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: "Số Token thu hồi phải là một số dương." });
        }
        const adminToUpdate = await User.findById(adminId);
        if (!adminToUpdate || !adminToUpdate.is_admin || adminToUpdate.is_super_admin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản Admin phụ hợp lệ." });
        }
        adminToUpdate.coins -= numAmount;
        if (adminToUpdate.coins < 0) {
            adminToUpdate.coins = 0;
        }
        await adminToUpdate.save();
        res.json({ success: true, message: `Thu hồi ${numAmount} Token từ ${adminToUpdate.username} thành công. Số dư mới: ${adminToUpdate.coins}` });
    } catch (error) {
        console.error("Lỗi khi thu hồi Token:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi thu hồi Token." });
    }
});
app.post('/api/delete-sub-admin', async (req, res) => {
    try {
        const { adminId } = req.body;
        if (!adminId) return res.status(400).json({ success: false, message: "Thiếu thông tin." });
        await User.updateMany({ managed_by_admin_ids: adminId }, { $pull: { managed_by_admin_ids: adminId } });
        const result = await User.deleteOne({ _id: adminId, is_super_admin: false });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, message: "Không tìm thấy admin phụ để xóa." });
        res.json({ success: true, message: "Xóa Admin phụ thành công!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
});

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
app.get('/api/lobbies', async (req, res) => {
    try {
        const lobbies = await Lobby.find({}).sort({ position: 1, _id: 1 });
        res.json({ success: true, lobbies });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});
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
            let gamesWithRates = games.map(game => ({ 
                ...game, 
                winRate: Math.floor(Math.random() * (85 - 10 + 1)) + 10 
            }));
            const randomHighRateCount = Math.floor(Math.random() * 4) + 2;
            const highRateCount = Math.min(games.length, randomHighRateCount);
            const indices = [...Array(games.length).keys()].sort(() => 0.5 - Math.random());
            for (let i = 0; i < highRateCount; i++) {
                const gameIndexToBoost = indices[i];
                gamesWithRates[gameIndexToBoost].winRate = Math.floor(Math.random() * (95 - 86 + 1)) + 86;
            }
            gamesWithRates.sort(() => 0.5 - Math.random());
            lobbyRatesCache[lobby_id] = { timestamp: now, games: gamesWithRates };
            res.json({ success: true, games: gamesWithRates });
        } else {
            res.json({ success: true, games: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});
app.post('/api/analyze-game', async (req, res) => {
    try {
        const { username, winRate, brandName } = req.body;
        if (!username || !winRate || !brandName) return res.status(400).json({ success: false, message: "Thiếu thông tin để phân tích." });
        const ANALYSIS_COST = 4;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        const currentBrandCoins = user.coins_by_brand.get(brandName) || 0;
        if (currentBrandCoins < ANALYSIS_COST) {
            return res.json({ success: false, message: `Không đủ Token cho ${brandName}! Bạn cần ${ANALYSIS_COST} Token.` });
        }
        const newCoinBalance = currentBrandCoins - ANALYSIS_COST;
        user.coins_by_brand.set(brandName, newCoinBalance);
        user.markModified('coins_by_brand');
        await user.save();
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