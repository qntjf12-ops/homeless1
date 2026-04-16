// CareCheck - 수요일 리셋 및 주차별 통계 엔진 (Vanilla JS)

const API_URL = "https://script.google.com/macros/s/AKfycbxHq-s9AT23OGHLvIe2keG4q6bK9qsfumCrIH9XqC64E-ZaazNBX0syMOStcEdQrnNLlA/exec";

// 2. State Management
let clients = []; 
let historyData = []; // 과거 상담 이력 데이터
let searchTerm = "";
let currentEditId = null;
let selectedStatWeekIdx = 4; // 선택된 통계 주차 (기본값: 이번 주, 0~4)
let groupsState = {}; // 각 그룹의 접힘 상태 저장
let exceptions = []; // [추가] 예외 인원 명단 (이름 배열)

// [추가] 수요일 00:00 기준 주간 시작일 계산 함수
function getWedStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0:일, 1:월, 2:화, 3:수, 4:목, 5:금, 6:토
    // 지난 수요일 정오(00:00)까지의 날짜 차이 계산
    const diff = (day < 3) ? (day + 4) : (day - 3); 
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    return d;
}

const CURRENT_WED_START = getWedStart();

// Initialize from Google Sheets
async function init() {
    updateDate();
    const container = document.getElementById('list-container');
    container.innerHTML = `<div class="loading-state" style="text-align: center; color: var(--text-muted); padding: 40px;">데이터 로드 중...</div>`;

    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        
        // [호환성 로직] 서버 배포 전(배열)과 배포 후(객체) 모두 대응
        const rawClients = Array.isArray(result) ? result : (result.clients || []);
        historyData = Array.isArray(result) ? [] : (result.history || []);
        exceptions = Array.isArray(result) ? [] : (result.exceptions || []); // [추가] 예외 명단 저장
        
        // 1. 메인 명단 매핑 및 '이번 주 수요일 이후 상담 여부' 판단
        clients = rawClients.map(item => {
            const lastCheckDate = item["상담일자"] ? new Date(item["상담일자"]) : null;
            return {
                id: item.rowId,
                name: item["이름"] || item["대상자명"] || "이름 없음",
                birthday: item["생년월일"] || item["생일"] || "-",
                gender: item["성별"] || "-",
                address: item["주소"] || item["거주지"] || item["현거주지"] || item["주거지"] || "-",
                category: item["분류"] || "-",
                manager: item["사례 관리자"] || item["사례관리자"] || "-",
                dateChecked: item["상담일자"] || "", 
                // [핵심] 이번 주 수요일 00시 이후에 상담 받았는지 체크
                checkedThisWeek: lastCheckDate && lastCheckDate >= CURRENT_WED_START,
                memo: item["메모"] || item["비고"] || "",
                _raw: item 
            };
        });

        renderList();
        updateStats();
    } catch (error) {
        console.error("Data fetch error:", error);
        container.innerHTML = `<div style="text-align: center; color: var(--accent-warning); padding: 20px;">데이터를 불러오지 못했습니다.</div>`;
    }
}

// 3. UI Actions
function updateDate() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('ko-KR', options);
}

function renderList() {
    const container = document.getElementById('list-container');
    container.innerHTML = "";

    let filtered = clients.filter(c => 
        c.name.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups = {};
    filtered.forEach(client => {
        const groupName = client.address.split(' ')[0] || "기타";
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(client);
    });

    const sortedGroupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ko'));

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">데이터가 없습니다.</div>`;
        return;
    }

    sortedGroupNames.forEach(groupName => {
        // 그룹 상태 초기화 (기본값: 열림)
        if (groupsState[groupName] === undefined) groupsState[groupName] = true;
        const isOpen = groupsState[groupName];

        // 그룹 헤더 추가 (클릭 시 접기/펼치기)
        const header = document.createElement('div');
        header.className = `group-header ${isOpen ? '' : 'collapsed'}`;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="building-2"></i> 
                <span>${groupName} (${groups[groupName].length}명)</span>
            </div>
            <i data-lucide="chevron-down" style="width: 18px; height: 18px;"></i>
        `;
        
        header.onclick = () => {
            groupsState[groupName] = !groupsState[groupName];
            renderList(); // 다시 그려서 상태 반영
        };
        container.appendChild(header);

        // 그룹 내용(명단) 컨테이너
        const groupContent = document.createElement('div');
        groupContent.className = 'group-content';
        if (!isOpen) groupContent.style.maxHeight = '0';
        else groupContent.style.maxHeight = '5000px'; // 넉넉하게 설정

        // 그룹 내 인원들 렌더링
        groups[groupName].forEach(client => {
            const roomInfo = client.address.replace(groupName, '').trim();
            // [강화] 양쪽 모두 공백 제거 및 소문자 변환 후 '포함' 여부 확인 (가장 강력한 방식)
            const clean = (str) => String(str || '').replace(/\s/g, '').toLowerCase();
            const isException = exceptions.some(ex => {
                const cleanEx = clean(ex);
                const cleanClient = clean(client.name);
                return cleanEx.includes(cleanClient) || cleanClient.includes(cleanEx);
            }); 
            
            const card = document.createElement('div');
            card.className = `client-card ${isException ? 'is-exception' : ''}`;
            card.innerHTML = `
                <div class="client-info">
                    <h4 style="flex-wrap: wrap; row-gap: 4px;">
                        <span class="client-name">${client.name} (${client.gender})</span>
                        ${isException ? '<i data-lucide="hospital" class="exception-icon" style="stroke-width: 3px;"></i>' : ''}
                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400; margin-left: 2px;">${roomInfo}</span>
                        <span class="badge" style="margin-left: auto;">${client.category}</span>
                    </h4>
                    <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px;">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${client.birthday}</span>
                        <div class="manager-info" style="color: var(--primary-light);">
                            <i data-lucide="user-check" style="width: 12px; height: 12px;"></i>
                            <span style="font-weight: 600;">${client.manager}</span>
                        </div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-memo" onclick="openDetail(${client.id})">
                        <i data-lucide="file-text"></i>
                    </button>
                    <button class="btn-check ${client.checkedThisWeek ? 'active' : ''}" onclick="toggleCheck(${client.id})">
                        <i data-lucide="check"></i>
                    </button>
                </div>
            `;
            groupContent.appendChild(card);
        });
        container.appendChild(groupContent);
    });
    lucide.createIcons();
}

function updateStats() {
    const total = clients.length;
    const checked = clients.filter(c => c.checkedThisWeek).length;
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

    document.getElementById('total-count').textContent = total;
    document.getElementById('checked-count').textContent = checked;
    document.getElementById('progress-percent').textContent = `${percent}%`;
    document.getElementById('pending-label').textContent = `이번주 진행률 (수요일 리셋)`;

    const circle = document.getElementById('progress-circle');
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (percent / 100 * circumference);

    if (document.getElementById('stats-view').style.display !== 'none') renderStats();
}

// [핵심] 주차별 인터랙티브 통계 렌더링
function renderStats() {
    const chart = document.getElementById('stats-chart');
    const pendingList = document.getElementById('pending-list');
    chart.innerHTML = "";

    // 1. 최근 5주간 수요일 범위(Wed~Tue) 계산
    const weeks = [];
    for (let i = 4; i >= 0; i--) {
        const d = new Date(CURRENT_WED_START);
        d.setDate(CURRENT_WED_START.getDate() - (i * 7));
        const end = new Date(d);
        end.setDate(d.getDate() + 7);
        weeks.push({
            start: new Date(d),
            end: end,
            label: `${d.getMonth()+1}/${d.getDate()}`
        });
    }

    // 2. 주차별 이력 데이터 가공
    const weeklyData = weeks.map(week => {
        // 해당 기간 동안 '상담이력' 시트에 기록된 사람 추출
        const completedNames = new Set(
            historyData.filter(h => {
                const hDate = new Date(h[0]);
                return hDate >= week.start && hDate < week.end;
            }).map(h => h[1]) // 이름 기준
        );

        const count = completedNames.size;
        const total = clients.length || 1;
        const percent = Math.round((count / total) * 100);
        return { ...week, count, percent, completedNames: Array.from(completedNames) };
    });

    // 3. 차트 렌더링
    weeklyData.forEach((week, idx) => {
        const barWrapper = document.createElement('div');
        barWrapper.className = `stat-bar-wrapper ${selectedStatWeekIdx === idx ? 'active' : ''}`;
        
        // 막대 높이 계산
        const height = Math.max((week.percent / 100) * 80, 5); // 80px 기준

        barWrapper.innerHTML = `
            <div class="stat-value" style="font-size: 0.65rem;">${week.count}명<br>${week.percent}%</div>
            <div class="stat-bar" style="height: ${height}px; background: ${selectedStatWeekIdx === idx ? 'var(--accent-success)' : 'var(--primary-light)'}"></div>
            <div class="stat-label">${week.label}</div>
        `;
        barWrapper.onclick = () => {
            selectedStatWeekIdx = idx;
            renderStats();
        };
        chart.appendChild(barWrapper);
    });

    // 4. 선택된 주차의 미완료자 명단 표시
    const activeWeek = weeklyData[selectedStatWeekIdx];
    const missed = clients.filter(c => !activeWeek.completedNames.includes(c.name));

    let html = `
        <div class="pending-section">
            <h3 style="font-size: 0.9rem; margin-bottom: 12px; border-left: 4px solid var(--accent-warning); padding-left: 8px;">
                ${activeWeek.label} 주차 미완료자 (${missed.length}명)
            </h3>
            <div class="pending-grid">
    `;

    if (missed.length === 0) {
        html += `<p style="text-align: center; color: var(--accent-success); padding: 20px;">🎉 완벽합니다! 전원 상담 완료</p>`;
    } else {
        missed.forEach(c => {
            html += `
                <div class="pending-item" style="background: var(--card-bg); padding: 12px; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600;">${c.name}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${c.address.split(' ')[0]}</div>
                    </div>
                    ${selectedStatWeekIdx === 4 ? `
                        <button class="btn-check" onclick="switchView('dashboard'); openDetail(${c.id});" style="width: 32px; height: 32px; border-radius: 50%;">
                            <i data-lucide="chevron-right"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        });
    }
    html += `</div></div>`;
    pendingList.innerHTML = html;
    lucide.createIcons();
}

function switchView(viewName) {
    document.getElementById('dashboard-view').style.display = viewName === 'stats' ? 'none' : 'block';
    document.getElementById('stats-view').style.display = viewName === 'stats' ? 'block' : 'none';
    document.getElementById('tab-dashboard').classList.toggle('active', viewName === 'dashboard');
    document.getElementById('tab-stats').classList.toggle('active', viewName === 'stats');
    if (viewName === 'stats') renderStats();
    lucide.createIcons();
}

async function toggleCheck(rowId) {
    const client = clients.find(c => c.id === rowId);
    if (!client) return;

    const today = new Date();
    const newValue = !client.checkedThisWeek;
    
    client.checkedThisWeek = newValue;
    client.dateChecked = newValue ? today.toISOString() : "";
    renderList();
    updateStats();

    try {
        // [수요일 리셋 로직] 상담여부 클릭 시 서버 전송 (이력은 서버 Code.js에서 자동 누적함)
        await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                rowId: rowId,
                columnName: "상담여부",
                value: newValue ? "V" : ""
            })
        });
        
        await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                rowId: rowId,
                columnName: "상담일자",
                value: newValue ? today.toISOString().split('T')[0] : ""
            })
        });

        if (window.navigator.vibrate) window.navigator.vibrate(50);
        if (newValue) {
            // 이력 데이터 낙관적 업데이트
            historyData.push([new Date().toISOString(), client.name, client.gender, client.address, client.manager]);
            if (document.getElementById('stats-view').style.display !== 'none') renderStats();
        }
    } catch (error) {
        alert("저장 실패");
        init();
    }
}

// Modal & Detail Logic
function openDetail(id) {
    currentEditId = id;
    const client = clients.find(c => c.id === id);
    const rawData = client._raw || {};
    
    document.getElementById('modal-title').textContent = `${client.name} 상세 정보`;
    document.getElementById('modal-subtitle').textContent = `행 번호: ${id}`;
    
    const contentArea = document.getElementById('modal-content-area');
    const skipFields = ['rowId', '이름', '생년월일', '성별', '주소', '상담여부', '메모', '상담일자'];
    
    let html = `
        <div class="detail-section"><label>상담 메모</label><textarea id="memo-textarea">${client.memo || ""}</textarea></div>
        <div class="extra-fields"><h4 style="margin-top: 20px;">기타 정보</h4>
    `;

    Object.keys(rawData).forEach(key => {
        if (!skipFields.includes(key)) {
            html += `<div class="detail-item"><label>${key}</label><input type="text" class="detail-input" data-key="${key}" value="${rawData[key] || ""}"></div>`;
        }
    });

    html += `</div>`;
    contentArea.innerHTML = html;
    document.getElementById('memo-modal').style.display = 'flex';
    lucide.createIcons();
}

function closeModal() { document.getElementById('memo-modal').style.display = 'none'; }
function closeAddModal() { document.getElementById('add-modal').style.display = 'none'; }
function openAddModal() { document.getElementById('add-form').reset(); document.getElementById('add-modal').style.display = 'flex'; }

async function saveDetail() {
    const text = document.getElementById('memo-textarea').value;
    const inputs = document.querySelectorAll('.detail-input');
    const updates = [{ columnName: "메모", value: text }];
    inputs.forEach(input => updates.push({ columnName: input.getAttribute('data-key'), value: input.value }));

    closeModal();
    for (const update of updates) {
        await fetch(API_URL, { method: "POST", body: JSON.stringify({ rowId: currentEditId, columnName: update.columnName, value: update.value })});
    }
    init();
}

async function deleteClient() {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "delete", rowId: currentEditId })});
    closeModal();
    init();
}

function calculateDates() {
    const rent = document.getElementById('add-rent-date').value;
    if (!rent) return;
    const d = new Date(rent);
    d.setMonth(d.getMonth() + 1);
    document.getElementById('add-end-date').value = d.toISOString().split('T')[0];
    d.setMonth(d.getMonth() + 3);
    document.getElementById('add-term-date').value = d.toISOString().split('T')[0];
}

async function addNewClient() {
    const data = {
        "이름": document.getElementById('add-name').value,
        "성별": document.getElementById('add-gender').value,
        "생년월일": document.getElementById('add-birthday').value,
        "분류": document.getElementById('add-category').value,
        "거주지": document.getElementById('add-address').value,
        "사례 관리자": document.getElementById('add-manager').value,
        "월세지원일": document.getElementById('add-rent-date').value,
        "주거지원 종료일": document.getElementById('add-end-date').value,
        "종결예정일": document.getElementById('add-term-date').value,
        "상담여부": "", "상담일자": "", "메모": ""
    };
    if (!data["이름"] || !data["거주지"]) { alert("필수 입력"); return; }
    await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "add", data: data })});
    closeAddModal();
    init();
}

document.getElementById('search-input').addEventListener('input', (e) => { searchTerm = e.target.value; renderList(); });
document.getElementById('sync-btn').addEventListener('click', init);
window.onload = init;
