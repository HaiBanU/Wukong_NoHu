// --- START OF FILE analysis.js (PHIÊN BẢN CUỐI CÙNG - SỬA LỖI ĐỒNG BỘ KHI QUAY LẠI) ---

window.onload = () => {
    // === LẤY CÁC PHẦN TỬ DOM ===
    const coinDisplay = document.getElementById('coin-display');
    const panelGameImage = document.getElementById('panel-game-image');
    const mainVisual = document.getElementById('analysis-main-visual');
    const progressTag = document.getElementById('progress-tag');
    const progressText = document.getElementById('progress-text');
    const analyzeButton = document.getElementById('analyze-button');
    const gameNameBottom = document.getElementById('game-name-display-bottom');
    const analysisProgressContainer = document.getElementById('analysis-progress-container');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressBarText = document.getElementById('progress-bar-text');
    const progressStatusText = document.querySelector('.progress-status-text');
    const infoBox1 = document.getElementById('info-box-1');
    const infoBox2 = document.getElementById('info-box-2');
    const infoBox3 = document.getElementById('info-box-3');

    // === LẤY DỮ LIỆU TỪ URL VÀ LOCALSTORAGE ===
    const params = new URLSearchParams(window.location.search);
    const gameName = params.get('gameName');
    const imageUrl = params.get('imageUrl');
    const initialWinRate = params.get('winRate');
    const lobbyName = decodeURIComponent(params.get('lobbyName'));
    const username = localStorage.getItem('username');
    const selectedBrand = sessionStorage.getItem('selectedBrand');

    if (!username || !gameName || !imageUrl || !lobbyName || !selectedBrand) {
        alert("Lỗi: Thiếu thông tin game, sảnh hoặc SẢNH GAME.");
        window.location.href = '/dashboard.html';
        return;
    }

    // === BIẾN QUẢN LÝ TRẠNG THÁI ===
    let isAnalyzing = false;
    let analysisTimerId = null;
    let countdownIntervalId = null;
    let visualDeductionIntervalId = null;
    let displayedTokens = 0;
    const ACTIVE_ANALYSIS_KEY = 'wukongActiveAnalysis';
    const VISUAL_TOKEN_KEY = 'wukongVisualTokenCount';

    // === CÁC HÀM TIỆN ÍCH ĐỒ HỌA ===
    const createParticleBurstEffect = () => { const container = document.querySelector('.particle-burst'); if (!container) return; container.innerHTML = ''; const particleCount = 40; const radius = 200; for (let i = 0; i < particleCount; i++) { const particle = document.createElement('div'); particle.className = 'particle'; const angle = Math.random() * 360; const duration = Math.random() * 1.5 + 1; const delay = Math.random() * 2.5; particle.style.setProperty('--angle', `${angle}deg`); particle.style.setProperty('--duration', `${duration}s`); particle.style.setProperty('--delay', `${delay}s`); particle.style.setProperty('--radius', `${radius}px`); container.appendChild(particle); } };
    const createScrollingText = (element, text) => { if (!element) return; element.innerHTML = `<span class="scrolling-text">${text}</span>`; };
    const createLightningField = (count = 6) => { const paths=["M15 0 L10 20 L18 20 L12 45 L22 45 L8 75 L16 75 L11 100","M18 0 L12 25 L20 25 L10 50 L25 50 L5 80 L15 80 L10 100","M12 0 L18 30 L10 30 L16 60 L8 60 L20 90 L14 90 L10 100"]; let html=''; for(let i=0; i < count; i++){const p=paths[Math.floor(Math.random()*paths.length)];html+=`<div class="lightning-container" style="--delay: -${Math.random()}s; --duration: ${Math.random() * 0.5 + 0.8}s;"><svg class="lightning-svg" viewBox="0 0 30 100"><path d="${p}" stroke="currentColor" stroke-width="2" fill="none"/></svg></div>`;} return html; };
    const createEnergyRain = (container) => { if (!container) return; container.innerHTML = ''; const count = 40; const colors = ['#ffd700', '#00ffff']; for (let i = 0; i < count; i++) { const p = document.createElement('div'); p.className = 'particle'; p.style.cssText = `height:${Math.random()*30+15}px;left:${Math.random()*100}%;animation-duration:${Math.random()*1.5+1}s;animation-delay:${Math.random()*3}s;color:${colors[Math.floor(Math.random()*colors.length)]};`; container.appendChild(p); } };
    const createHolographicRings = (container) => { if (!container) return; container.innerHTML = ''; for (let i = 0; i < 3; i++) { const r = document.createElement('div'); r.className = 'ring'; r.style.cssText = `width:${(i+1)*90}px;height:${(i+1)*90}px;animation-delay:${i*0.9}s;`; container.appendChild(r); } };

    // === CÁC HÀM XỬ LÝ LOGIC ===
    const updateDisplayedTokens = (amount) => {
        displayedTokens = amount;
        coinDisplay.textContent = displayedTokens;
        sessionStorage.setItem(VISUAL_TOKEN_KEY, displayedTokens);
    };

    const fetchUserInfoFromServer = async () => {
        try {
            const res = await fetch(`/api/user-info?username=${username}`);
            const data = await res.json();
            if (data.success) {
                const coinsByBrand = data.userInfo.coins_by_brand || {};
                const currentCoins = coinsByBrand[selectedBrand] || 0;
                updateDisplayedTokens(currentCoins);
            }
        } catch (e) { console.error("Lỗi fetch user info", e); }
    };

    const initializeTokenDisplay = async () => {
        const savedAnalysisJSON = sessionStorage.getItem(ACTIVE_ANALYSIS_KEY);
        const visualTokenCount = sessionStorage.getItem(VISUAL_TOKEN_KEY);

        if (savedAnalysisJSON && visualTokenCount !== null) {
            const savedAnalysis = JSON.parse(savedAnalysisJSON);
            if (savedAnalysis.gameName === gameName) {
                updateDisplayedTokens(parseInt(visualTokenCount, 10));
                return;
            }
        }
        await fetchUserInfoFromServer();
    };

    const cleanupSession = () => {
        sessionStorage.removeItem(ACTIVE_ANALYSIS_KEY);
        sessionStorage.removeItem(VISUAL_TOKEN_KEY);
    };

    const handleInsufficientTokens = (message) => {
        stopAllTimers();
        cleanupSession();
        alert(message);
        const lastLobbyData = sessionStorage.getItem('lastLobby');
        if (lastLobbyData) {
            const { id, name } = JSON.parse(lastLobbyData);
            window.location.href = `/games.html?lobby_id=${id}&lobby_name=${encodeURIComponent(name)}`;
        } else {
            window.location.href = '/dashboard.html';
        }
    };

    const stopAllTimers = () => {
        if (analysisTimerId) clearInterval(analysisTimerId);
        if (countdownIntervalId) clearInterval(countdownIntervalId);
        if (visualDeductionIntervalId) clearInterval(visualDeductionIntervalId);
        analysisTimerId = null;
        countdownIntervalId = null;
        visualDeductionIntervalId = null;
    };

    const handleRecurringDeduction = async () => {
        try {
            const response = await fetch('/api/deduct-recurring-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, brandName: selectedBrand })
            });
            const result = await response.json();

            if (result.success) {
                updateDisplayedTokens(result.newCoinBalance);
                progressStatusText.textContent = `Đã trừ 10 Token để duy trì phân tích...`;
            } else if (result.outOfTokens) {
                handleInsufficientTokens(result.message);
            }
        } catch (error) {
            console.error('Lỗi kết nối khi trừ Token định kỳ:', error);
            stopAllTimers();
        }
    };

    function initializeUI() {
        createScrollingText(gameNameBottom, gameName);
        panelGameImage.src = imageUrl;
        mainVisual.innerHTML = `<div id="holographic-rings"></div><img id="robot-image" src="/assets/images/robot-bg.png" alt="Analyzing...">`;
        const frameLightning = document.getElementById('frame-wide-lightning');
        if (frameLightning) { frameLightning.innerHTML = `<div class="lightning-field left">${createLightningField()}</div><div class="lightning-field right">${createLightningField()}</div>`; }
        createEnergyRain(document.getElementById('particle-field'));
        createHolographicRings(document.getElementById('holographic-rings'));
        createParticleBurstEffect();
        progressText.textContent = initialWinRate ? `${initialWinRate}%` : '0%';
        progressTag.classList.remove('result-state');
        [infoBox1, infoBox2, infoBox3].forEach(box => {
            box.classList.remove('result-reveal', 'result-highlight');
            const title = box.querySelector('span').textContent;
            box.innerHTML = `<span>${title}</span><small>Chưa có dữ liệu</small>`;
        });
    }

    function displayResults(results) {
        progressText.textContent = `${results.finalRate}%`;
        progressTag.classList.add('result-state');
        infoBox1.innerHTML = `<span>QUAY MỒI</span><small>${results.quayMoiVong} vòng - Mức cược ${results.quayMoiMucCuoc}K</small>`;
        infoBox2.innerHTML = `<span>QUAY AUTO</span><small>${results.quayAutoVong} vòng - Mức cược ${results.quayAutoMucCuoc}K</small>`;
        infoBox3.innerHTML = `<span>KHUNG GIỜ VÀNG</span><small>${results.khungGio}</small>`;
        [infoBox1, infoBox2, infoBox3].forEach((box, index) => {
            box.style.animationDelay = `${index * 0.15}s`;
            box.classList.add('result-reveal', 'result-highlight');
        });
        analysisProgressContainer.style.display = 'none';
        analyzeButton.style.display = 'block';
    }

    function startResultCountdown(durationInSeconds) {
        stopAllTimers();
        let timeLeft = durationInSeconds;
        
        const updateTimer = () => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            analyzeButton.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };

        analyzeButton.disabled = true;
        updateTimer();

        countdownIntervalId = setInterval(() => {
            timeLeft--;
            updateTimer();
            if (timeLeft <= 0) {
                stopAllTimers();
                cleanupSession();
                analyzeButton.disabled = false;
                analyzeButton.textContent = "Phân Tích Lại";
                isAnalyzing = false;
            }
        }, 1000);

        visualDeductionIntervalId = setInterval(() => {
            if (displayedTokens > 0) {
                updateDisplayedTokens(displayedTokens - 1);
            }
        }, 6000);

        analysisTimerId = setInterval(handleRecurringDeduction, 60000);
    }

    const resumeAnalysis = (savedState) => {
        const remainingTime = Math.floor((savedState.expiresAt - Date.now()) / 1000);
        if (remainingTime > 0) {
            displayResults(savedState.results);
            startResultCountdown(remainingTime);
            progressStatusText.textContent = `Đã khôi phục phiên phân tích. Đang duy trì...`;
        } else {
            cleanupSession();
            initializeUI();
        }
    };

    analyzeButton.addEventListener('click', async () => {
        if (isAnalyzing) return;
        isAnalyzing = true;
        stopAllTimers();
        cleanupSession();
        document.body.classList.remove('analyzing');
        initializeUI();
        
        analyzeButton.style.display = 'none';
        analysisProgressContainer.style.display = 'block';
        progressStatusText.textContent = `Đang phân tích Sảnh "${lobbyName}" game "${gameName}"...`;
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 2;
            progressBarFill.style.width = `${progress}%`;
            progressBarText.textContent = `${Math.floor(progress)}%`;
            if (progress >= 100) clearInterval(progressInterval);
        }, 100);

        setTimeout(async () => {
            clearInterval(progressInterval);
            try {
                const response = await fetch('/api/analyze-game', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, winRate: initialWinRate, brandName: selectedBrand })
                });
                const result = await response.json();

                if (result.success) {
                    updateDisplayedTokens(result.newCoinBalance);
                    const now = new Date(), future = new Date(now.getTime() + 30 * 60 * 1000);
                    const formatTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    const analysisResults = {
                        finalRate: result.analysisResult,
                        quayMoiVong: Math.floor(Math.random() * 21) + 20,
                        quayAutoVong: Math.floor(Math.random() * 21) + 20,
                        quayMoiMucCuoc: Math.floor(Math.random() * 37) + 4,
                        quayAutoMucCuoc: Math.floor(Math.random() * 19) + 2,
                        khungGio: `${formatTime(now)} - ${formatTime(future)}`
                    };
                    const expiresAt = Date.now() + 10 * 60 * 1000;
                    const stateToSave = { gameName, expiresAt, results: analysisResults };
                    sessionStorage.setItem(ACTIVE_ANALYSIS_KEY, JSON.stringify(stateToSave));
                    displayResults(analysisResults);
                    startResultCountdown(600);
                } else if (result.outOfTokens) {
                    handleInsufficientTokens(result.message);
                } else {
                    progressStatusText.textContent = result.message;
                    setTimeout(() => { analyzeButton.style.display = 'block'; isAnalyzing = false; }, 2000);
                }
            } catch (error) {
                progressStatusText.textContent = 'Lỗi kết nối máy chủ.';
                isAnalyzing = false;
            }
        }, 5000);
    });

    // === LOGIC CHÍNH KHI TẢI TRANG ===
    (async () => {
        await initializeTokenDisplay();
        const savedAnalysisJSON = sessionStorage.getItem(ACTIVE_ANALYSIS_KEY);
        if (savedAnalysisJSON) {
            const savedAnalysis = JSON.parse(savedAnalysisJSON);
            if (savedAnalysis.gameName === gameName) {
                resumeAnalysis(savedAnalysis);
            } else {
                initializeUI();
            }
        } else {
            initializeUI();
        }
        window.addEventListener('beforeunload', stopAllTimers);
    })();
};