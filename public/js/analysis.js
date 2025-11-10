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
        alert("Lỗi: Thiếu thông tin game, sảnh hoặc thương hiệu."); 
        window.location.href = '/dashboard.html'; 
        return; 
    }

    let isAnalyzing = false;

    // === BẮT ĐẦU: HÀM MỚI TẠO HIỆU ỨNG TIA NĂNG LƯỢNG ===
    const createParticleBurstEffect = () => {
        const container = document.querySelector('.particle-burst');
        if (!container) return;
        
        container.innerHTML = ''; // Xóa các tia cũ trước khi tạo mới
        const particleCount = 40; // Tổng số tia năng lượng
        const radius = 200; // Bán kính từ tâm khung ra đến viền (tương đương 1/2 chiều rộng tối đa của khung)

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';

            const angle = Math.random() * 360; // Tạo góc bắn ngẫu nhiên
            const duration = Math.random() * 1.5 + 1; // Thời gian tồn tại ngẫu nhiên
            const delay = Math.random() * 2.5; // Độ trễ ngẫu nhiên để các tia không bắn ra cùng lúc

            // Gán các giá trị ngẫu nhiên này vào biến CSS của từng tia
            particle.style.setProperty('--angle', `${angle}deg`);
            particle.style.setProperty('--duration', `${duration}s`);
            particle.style.setProperty('--delay', `${delay}s`);
            particle.style.setProperty('--radius', `${radius}px`);

            container.appendChild(particle);
        }
    };
    // === KẾT THÚC: HÀM MỚI ===

    // === CÁC HÀM TIỆN ÍCH (Giữ nguyên) ===
    const createScrollingText = (element, text) => { if (!element) return; element.innerHTML = `<span class="scrolling-text">${text}</span>`; };
    const createLightningField = (count = 6) => { const paths=["M15 0 L10 20 L18 20 L12 45 L22 45 L8 75 L16 75 L11 100","M18 0 L12 25 L20 25 L10 50 L25 50 L5 80 L15 80 L10 100","M12 0 L18 30 L10 30 L16 60 L8 60 L20 90 L14 90 L10 100"]; let html=''; for(let i=0; i < count; i++){const p=paths[Math.floor(Math.random()*paths.length)];html+=`<div class="lightning-container" style="--delay: -${Math.random()}s; --duration: ${Math.random() * 0.5 + 0.8}s;"><svg class="lightning-svg" viewBox="0 0 30 100"><path d="${p}" stroke="currentColor" stroke-width="2" fill="none"/></svg></div>`;} return html; };
    const createEnergyRain = (container) => { if (!container) return; container.innerHTML = ''; const count = 40; const colors = ['#ffd700', '#00ffff']; for (let i = 0; i < count; i++) { const p = document.createElement('div'); p.className = 'particle'; p.style.cssText = `height:${Math.random()*30+15}px;left:${Math.random()*100}%;animation-duration:${Math.random()*1.5+1}s;animation-delay:${Math.random()*3}s;color:${colors[Math.floor(Math.random()*colors.length)]};`; container.appendChild(p); } };
    const createHolographicRings = (container) => { if (!container) return; container.innerHTML = ''; for (let i = 0; i < 3; i++) { const r = document.createElement('div'); r.className = 'ring'; r.style.cssText = `width:${(i+1)*90}px;height:${(i+1)*90}px;animation-delay:${i*0.9}s;`; container.appendChild(r); } };
    
    const fetchUserInfo = async () => { 
        try { 
            const res = await fetch(`/api/user-info?username=${username}`); 
            const data = await res.json(); 
            if (data.success) {
                const coinsByBrand = data.userInfo.coins_by_brand || {};
                const currentCoins = coinsByBrand[selectedBrand] || 0;
                coinDisplay.textContent = currentCoins;
            } 
        } catch (e) { console.error("Lỗi fetch user info", e); } 
    };

    function initializeUI() {
        createScrollingText(gameNameBottom, gameName);
        panelGameImage.src = imageUrl;
        mainVisual.innerHTML = `<div id="holographic-rings"></div><img id="robot-image" src="/assets/images/robot-bg.png" alt="Analyzing...">`;
        const frameLightning = document.getElementById('frame-wide-lightning');
        if (frameLightning) {
            frameLightning.innerHTML = `<div class="lightning-field left">${createLightningField()}</div><div class="lightning-field right">${createLightningField()}</div>`;
        }
        createEnergyRain(document.getElementById('particle-field'));
        createHolographicRings(document.getElementById('holographic-rings'));
        
        // GỌI HÀM MỚI ĐỂ TẠO HIỆU ỨNG
        createParticleBurstEffect();
        
        progressText.textContent = initialWinRate ? `${initialWinRate}%` : '0%';
        progressTag.classList.remove('result-state');
        [infoBox1, infoBox2, infoBox3].forEach(box => {
            box.classList.remove('result-reveal', 'result-highlight');
            const title = box.querySelector('span').textContent;
            box.innerHTML = `<span>${title}</span><small>0 vòng - Mức Min 0K</small>`;
        });
        infoBox3.innerHTML = `<span>KHUNG GIỜ</span><small>Chưa có dữ liệu</small>`;
        fetchUserInfo();
    }

    function startAnalysisAnimation(duration) {
        analyzeButton.style.display = 'none';
        analysisProgressContainer.style.display = 'block';
        progressStatusText.textContent = `Đang phân tích Sảnh "${lobbyName}" game "${gameName}"...`;
        document.body.classList.add('analyzing');
        let progress = 0;
        const interval = setInterval(() => {
            progress += 100 / (duration / 50);
            if (progress >= 100) { progress = 100; clearInterval(interval); }
            progressBarFill.style.width = `${progress}%`;
            progressBarText.textContent = `${Math.floor(progress)}%`;
        }, 50);
    }

    function displayResults(finalRate) {
        const quayMoiVong = Math.floor(Math.random() * 51) + 50;
        const quayMoiMucCuoc = (Math.floor(Math.random() * 37) + 4);
        const quayAutoVong = Math.floor(Math.random() * 51) + 30;
        const quayAutoMucCuoc = (Math.floor(Math.random() * 19) + 2);
        const now = new Date(); const future = new Date(now.getTime() + 30 * 60 * 1000);
        const formatTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const khungGio = `${formatTime(now)} - ${formatTime(future)}`;
        progressText.textContent = `${finalRate}%`;
        progressTag.classList.add('result-state');
        infoBox1.innerHTML = `<span>QUAY MỒI</span><small>${quayMoiVong} vòng - Mức cược ${quayMoiMucCuoc}K</small>`;
        infoBox2.innerHTML = `<span>QUAY AUTO</span><small>${quayAutoVong} vòng - Mức cược ${quayAutoMucCuoc}K</small>`;
        infoBox3.innerHTML = `<span>KHUNG GIỜ VÀNG</span><small>${khungGio}</small>`;
        [infoBox1, infoBox2, infoBox3].forEach((box, index) => {
            box.style.animationDelay = `${index * 0.15}s`;
            box.classList.add('result-reveal', 'result-highlight');
        });
    }
    
    function startResultCountdown(duration) {
        analysisProgressContainer.style.display = 'none';
        analyzeButton.style.display = 'block';
        analyzeButton.disabled = true;
        let timeLeft = duration;
        const updateTimer = () => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            analyzeButton.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };
        updateTimer();
        const countdownInterval = setInterval(() => {
            timeLeft--;
            updateTimer();
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                analyzeButton.disabled = false;
                analyzeButton.textContent = "Phân Tích Lại";
                isAnalyzing = false;
            }
        }, 1000);
    }

    analyzeButton.addEventListener('click', async () => {
        if (isAnalyzing) return;
        isAnalyzing = true;
        document.body.classList.remove('analyzing'); initializeUI(); startAnalysisAnimation(5000);
        setTimeout(async () => {
            try {
                const response = await fetch('/api/analyze-game', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ 
                        username: username,
                        winRate: initialWinRate,
                        brandName: selectedBrand
                    }) 
                });
                const result = await response.json();
                if (result.success) {
                    coinDisplay.textContent = result.newCoinBalance; 
                    displayResults(result.analysisResult); 
                    startResultCountdown(600);
                } else {
                    progressStatusText.textContent = result.message;
                    setTimeout(() => { analysisProgressContainer.style.display = 'none'; analyzeButton.style.display = 'block'; analyzeButton.textContent = "Thử Lại"; isAnalyzing = false; }, 2000);
                }
            } catch (error) { progressStatusText.textContent = 'Lỗi kết nối máy chủ.'; isAnalyzing = false; } 
            finally { document.body.classList.remove('analyzing'); }
        }, 5000);
    });

    initializeUI();
};