// CareCheck - 수요일 리셋 및 주차별 통계 엔진 (Vanilla JS)

const API_URL = "https://script.google.com/macros/s/AKfycbxHq-s9AT23OGHLvIe2keG4q6bK9qsfumCrIH9XqC64E-ZaazNBX0syMOStcEdQrnNLlA/exec";

// 2. State Management
let clients = []; 
let historyData = []; // 과거 상담 이력 데이터
let searchTerm = "";
let currentEditId = null;
let selectedStatWeekIdx = 4; // 선택된 통계 주차 (기본값: 이번 주, 0~4)
let statsGroupBy = 'manager'; // 통계 정렬 기준 (manager 또는 building)
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

// [추가] XSS 방지를 위한 HTML 특수문자 클리닝 함수 (보안 강화)
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// [추가] 날짜 포맷 정리 함수 (시간 제거 및 오류 방지)
function formatDate(val) {
    if (!val || val === "-") return "-";
    try {
        // 이미 YYYY-MM-DD 형식인 경우 그대로 반환
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            return val.substring(0, 10);
        }
        // Date 객체이거나 변환 가능한 경우
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            // 로컬 시간 기준으로 YYYY-MM-DD 추출
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        // 변환 불가능하면 원본 문자열 반환 (예: 800101 등)
        return String(val).substring(0, 10);
    } catch (e) {
        return String(val);
    }
}

// Initialize from Google Sheets
async function init() {
    updateDate();
    const container = document.getElementById('list-container');
    container.innerHTML = `<div class="loading-state" style="text-align: center; color: var(--text-muted); padding: 40px;">데이터 로드 중...</div>`;

    try {
        const response = await fetch(`${API_URL}?nocache=${new Date().getTime()}`, { cache: "no-store" });
        const result = await response.json();
        
        // [호환성 로직] 서버 배포 전(배열)과 배포 후(객체) 모두 대응
        const rawClients = Array.isArray(result) ? result : (result.clients || []);
        historyData = Array.isArray(result) ? [] : (result.history || []);
        exceptions = Array.isArray(result) ? [] : (result.exceptions || []); // [추가] 예외 명단 저장
        
        // 1. 메인 명단 매핑 및 '이번 주 수요일 이후 상담 여부' 판단
        clients = rawClients.map(item => {
            let lastCheckDate = null;
            if (item["상담일자"]) {
                const d = new Date(item["상담일자"]);
                if (!isNaN(d.getTime())) lastCheckDate = d;
            }
            return {
                id: item.rowId,
                name: item["이름"] || item["대상자명"] || "이름 없음",
                birthday: formatDate(item["생년월일"] || item["생일"]),
                gender: item["성별"] || "-",
                address: item["주소"] || item["거주지"] || item["현거주지"] || item["주거지"] || "-",
                category: item["분류"] || "-",
                manager: item["사례 관리자"] || item["사례관리자"] || "-",
                dateChecked: item["상담일자"] || "", 
                checkType: (lastCheckDate && lastCheckDate >= CURRENT_WED_START) ? (item["상담여부"] || "") : "",
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
        container.innerHTML = `<div style="text-align: center; color: var(--accent-warning); padding: 20px;">데이터를 불러오지 못했습니다.<br><span style="font-size:0.8rem;opacity:0.7;">${escapeHTML(error.message)}</span></div>`;
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

    const fragment = document.createDocumentFragment();

    sortedGroupNames.forEach(groupName => {
        if (groupsState[groupName] === undefined) groupsState[groupName] = true;
        const isOpen = groupsState[groupName];

        const header = document.createElement('div');
        header.className = `group-header ${isOpen ? '' : 'collapsed'}`;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="building-2"></i> 
                <span>${escapeHTML(groupName)} (${groups[groupName].length}명)</span>
            </div>
            <i data-lucide="chevron-down" style="width: 18px; height: 18px;"></i>
        `;
        
        header.onclick = () => {
            groupsState[groupName] = !groupsState[groupName];
            renderList();
        };
        fragment.appendChild(header);

        const groupContent = document.createElement('div');
        groupContent.className = 'group-content';
        if (!isOpen) groupContent.style.maxHeight = '0';
        else groupContent.style.maxHeight = '5000px';

        let innerHTMLString = '';

        groups[groupName].forEach(client => {
            const roomInfo = client.address.replace(groupName, '').trim();
            // 한글 정규화(NFC) 및 특수문자/공백 제거로 매칭률 극대화
            let isException = false;
            try {
                const clean = (str) => String(str || '')
                    .normalize('NFC') 
                    .replace(/[^a-zA-Z0-9가-힣]/g, '')
                    .toLowerCase();

                const cleanClient = clean(client.name);
                isException = Array.isArray(exceptions) && exceptions.some(ex => {
                    const cleanEx = clean(ex);
                    return (cleanEx.length > 1 && cleanClient.length > 1) && 
                           (cleanEx.includes(cleanClient) || cleanClient.includes(cleanEx));
                });
                client.isException = isException;
            } catch (e) {
                console.error("Exception match error:", e);
            }
            
            innerHTMLString += `
                <div class="client-card ${isException ? 'is-exception' : ''}">
                    <div class="client-info">
                        <h4 style="flex-wrap: wrap; row-gap: 4px;">
                            <span class="client-name">${escapeHTML(client.name)} (${escapeHTML(client.gender)})</span>
                            ${isException ? '<i data-lucide="hospital" class="exception-icon" style="stroke-width: 3px;"></i>' : ''}
                            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400; margin-left: 2px;">${escapeHTML(roomInfo)}</span>
                            <span class="badge" style="margin-left: auto;">${escapeHTML(client.category)}</span>
                        </h4>
                        <!-- DEBUG INFO -->
                        <div style="font-size: 0.65rem; color: red;">RAW상담일자: [${escapeHTML(client._raw["상담일자"])}] / RAW여부: [${escapeHTML(client._raw["상담여부"])}] / 파싱된체크여부: ${client.checkedThisWeek}</div>
                        <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px;">
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(client.birthday)}</span>
                            <div class="manager-info" style="color: var(--primary-light);">
                                <i data-lucide="user-check" style="width: 12px; height: 12px;"></i>
                                <span style="font-weight: 600;">${escapeHTML(client.manager)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-memo" onclick="openDetail(${client.id})">
                            <i data-lucide="file-text"></i>
                        </button>
                        <div class="check-group">
                            <button class="btn-type btn-visit ${client.checkType === '대면' ? 'active' : ''}" onclick="toggleCheck(${client.id}, '대면')">대면</button>
                            <button class="btn-type btn-absent ${client.checkType === '부재' ? 'active' : ''}" onclick="toggleCheck(${client.id}, '부재')">부재</button>
                        </div>
                    </div>
                </div>
            `;
        });
        groupContent.innerHTML = innerHTMLString;
        fragment.appendChild(groupContent);
    });
    container.appendChild(fragment);
    
    // 이전에 여러 번 호출되던 것을 렌더링 끝난 후 한 번만 호출하여 성능 향상
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

    // 6. 미완료자 통계 (관리자별/건물별 토글 기능 포함)
    const activeWeek = weeklyData[selectedStatWeekIdx];
    const missed = clients.filter(c => !activeWeek.completedNames.includes(c.name));

    // 그룹화 데이터 생성
    const groupedData = {};
    missed.forEach(c => {
        let key = "";
        if (statsGroupBy === 'manager') {
            key = c.manager || "미지정";
        } else {
            key = c.address.split(' ')[0] || "기타";
        }
        
        if (!groupedData[key]) groupedData[key] = [];
        groupedData[key].push(c);
    });

    let html = `
        <div class="pending-section">
            <h3 style="font-size: 0.9rem; margin-bottom: 12px; border-left: 4px solid var(--accent-warning); padding-left: 8px;">
                ${escapeHTML(activeWeek.label)} 주차 미완료자 (${missed.length}명)
            </h3>
            
            <!-- 정렬 기준 스위치 -->
            <div class="stats-toggle-bar">
                <button class="toggle-btn ${statsGroupBy === 'manager' ? 'active' : ''}" onclick="changeStatsGroup('manager')">관리자별</button>
                <button class="toggle-btn ${statsGroupBy === 'building' ? 'active' : ''}" onclick="changeStatsGroup('building')">주거지별</button>
            </div>

            <div class="pending-compact-grid">
    `;

    if (missed.length === 0) {
        html += `<p style="text-align: center; color: var(--accent-success); padding: 20px;">🎉 완벽합니다! 전원 상담 완료</p>`;
    } else {
        Object.keys(groupedData).sort().forEach(groupKey => {
            html += `
                <div class="building-tag-block">
                    <div class="building-tag-label">${escapeHTML(groupKey)} (${groupedData[groupKey].length}명)</div>
                    <div class="tag-container">
                        ${groupedData[groupKey].map(c => {
                            const subInfo = statsGroupBy === 'manager' 
                                ? c.address.split(' ')[0] 
                                : c.address.replace(groupKey, '').trim(); 
                            
                            return `
                                <div class="name-tag" onclick="switchView('dashboard'); openDetail(${c.id});">
                                    <span class="tag-name">${escapeHTML(c.name)}</span>
                                    <span class="tag-room">${escapeHTML(subInfo)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });
    }
    html += `</div></div>`;
    pendingList.innerHTML = html;
    lucide.createIcons();
}

// 통계 정렬 기준 변경 함수
function changeStatsGroup(mode) {
    statsGroupBy = mode;
    renderStats();
}

function switchView(viewName) {
    document.getElementById('dashboard-view').style.display = viewName === 'stats' ? 'none' : 'block';
    document.getElementById('stats-view').style.display = viewName === 'stats' ? 'block' : 'none';
    document.getElementById('tab-dashboard').classList.toggle('active', viewName === 'dashboard');
    document.getElementById('tab-stats').classList.toggle('active', viewName === 'stats');
    if (viewName === 'stats') renderStats();
    lucide.createIcons();
}

async function toggleCheck(rowId, type) {
    const client = clients.find(c => c.id === rowId);
    if (!client) return;

    const today = new Date();
    // 이미 같은 타입이 선택되어 있으면 해제(빈값), 아니면 새로운 타입 선택
    const newValue = client.checkType === type ? "" : type;
    
    client.checkType = newValue;
    client.checkedThisWeek = !!newValue;
    client.dateChecked = newValue ? today.toISOString() : "";
    renderList();
    updateStats();

    try {
        // 벌크 업데이트 (최신 버전 GAS 지원) 및 순차 업데이트 (구버전 GAS 호환성 지원) 동시 진행
        // 또한 UTC 변환(toISOString)으로 인해 한국의 경우 시간이 9시간 빨라져,
        // 오전 9시 이전 클릭 시 전날로 기록되어 수요일 초기화가 엇나가는 버그를 방지 (formatDate 사용)
        const dateStr = newValue ? formatDate(today) : "";
        
        // 저장 중 UI 표시
        const syncBtn = document.getElementById('sync-btn');
        const syncSpan = syncBtn.querySelector('span');
        const syncIcon = syncBtn.querySelector('i');
        if (syncSpan) syncSpan.textContent = "저장 중...";
        if (syncIcon) syncIcon.style.color = "var(--accent-warning)";
        
        // 구글 스크립트 동시 요청 시 락(Lock) 충돌이 발생할 수 있으므로 순차적으로 하나씩 처리합니다.
        await fetch(API_URL, {
            method: "POST",
            keepalive: true, // 페이지 새로고침 시에도 요청이 끊기지 않도록 유지
            body: JSON.stringify({
                action: "update",
                rowId: rowId,
                columnName: "상담여부",
                value: newValue,
                updates: [
                    { columnName: "상담여부", value: newValue },
                    { columnName: "상담일자", value: dateStr }
                ]
            })
        });

        await fetch(API_URL, {
            method: "POST",
            keepalive: true,
            body: JSON.stringify({
                action: "update",
                rowId: rowId,
                columnName: "상담일자", // 구버전 GAS 강제 호환용 추가 기록
                value: dateStr
            })
        });

        if (syncSpan) syncSpan.textContent = "동기화";
        if (syncIcon) syncIcon.style.color = "";

        if (window.navigator.vibrate) window.navigator.vibrate(50);
        if (newValue) {
            historyData.push([new Date().toISOString(), client.name, client.gender, client.address, client.manager, newValue]);
            if (document.getElementById('stats-view').style.display !== 'none') renderStats();
        }
    } catch (error) {
        if (syncSpan) syncSpan.textContent = "동기화";
        if (syncIcon) syncIcon.style.color = "";
        
        // 사용자가 새로고침을 눌러서 fetch가 강제 취소(Abort)된 경우는 에러 경고창을 띄우지 않음
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            console.warn("User refreshed or network interrupted before save completed.");
        } else {
            console.error("Save error:", error);
            alert(`저장 실패: ${error.message || '네트워크 오류'}`);
            init();
        }
    }
}

// Modal & Detail Logic
function openDetail(id) {
    currentEditId = id;
    const client = clients.find(c => c.id === id);
    const rawData = client._raw || {};
    
    document.getElementById('modal-title').textContent = `${escapeHTML(client.name)} 상세 정보`;
    document.getElementById('modal-subtitle').textContent = `행 번호: ${id}`;
    
    const contentArea = document.getElementById('modal-content-area');
    
    const mainFields = [
        { key: '이름', label: '성함', value: escapeHTML(client.name) },
        { key: '생년월일', label: '생년월일', value: escapeHTML(formatDate(client.birthday)), type: 'date' },
        { key: '주소', label: '거주지(건물+호수)', value: escapeHTML(client.address) },
        { key: '분류', label: '분류', value: escapeHTML(client.category) },
        { key: '사례 관리자', label: '담당 관리자', value: escapeHTML(client.manager) }
    ];

    const skipFields = ['rowId', '상담여부', '메모', '상담일자', ...mainFields.map(f => f.key)];
    
    let html = `
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
            <button id="exception-toggle-btn" class="btn-exception-toggle ${client.isException ? 'active' : ''}" onclick="toggleException('${escapeHTML(client.name)}')">
                <i data-lucide="hospital"></i>
                <span>${client.isException ? '관리대상 해제' : '관리대상 지정'}</span>
            </button>
        </div>
        
        <div class="detail-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
    `;

    mainFields.forEach(f => {
        html += `
            <div class="detail-item" style="${f.key === '주소' ? 'grid-column: span 2;' : ''}">
                <label>${escapeHTML(f.label)}</label>
                <input type="${f.type || 'text'}" class="detail-input" data-key="${escapeHTML(f.key)}" value="${f.value || ""}">
            </div>
        `;
    });

    html += `</div>
        <div class="detail-section">
            <label>상담 메모</label>
            <textarea id="memo-textarea" placeholder="특이사항을 입력하세요...">${escapeHTML(client.memo || "")}</textarea>
        </div>
        <div class="extra-fields">
            <h4 style="margin-top: 24px; margin-bottom: 12px; font-size: 0.9rem; color: var(--primary-light);">추가 필드</h4>
    `;

    Object.keys(rawData).forEach(key => {
        if (!skipFields.includes(key)) {
            html += `<div class="detail-item"><label>${escapeHTML(key)}</label><input type="text" class="detail-input" data-key="${escapeHTML(key)}" value="${escapeHTML(rawData[key] || "")}"></div>`;
        }
    });

    html += `</div>`;
    contentArea.innerHTML = html;
    document.getElementById('memo-modal').style.display = 'flex';
    lucide.createIcons();
}

async function toggleException(name) {
    const client = clients.find(c => c.name === name);
    if (!client) return;

    const isAdding = !client.isException;
    const btn = document.getElementById('exception-toggle-btn');
    
    // UI 낙관적 업데이트
    client.isException = isAdding;
    btn.classList.toggle('active', isAdding);
    btn.querySelector('span').textContent = isAdding ? '관리대상 해제' : '관리대상 지정';
    
    if (window.navigator.vibrate) window.navigator.vibrate(50);

    try {
        await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: isAdding ? "addException" : "removeException",
                name: name
            })
        });
        // 전체 캐시 갱신을 위해 init() 호출대신 로컬 데이터만 살짝 건드려도 되지만, 
        // 확실하게 하기 위해 리스트만 다시 그립니다.
        renderList();
    } catch (error) {
        console.error("Exception toggle error:", error);
        alert(`상태 변경 실패: ${error.message || '네트워크 오류'}`);
        init();
    }
}

function closeModal() { document.getElementById('memo-modal').style.display = 'none'; }
function closeAddModal() { document.getElementById('add-modal').style.display = 'none'; }
function openAddModal() { document.getElementById('add-form').reset(); document.getElementById('add-modal').style.display = 'flex'; }

async function saveDetail() {
    const text = document.getElementById('memo-textarea').value;
    const inputs = document.querySelectorAll('.detail-input');
    const updates = [{ columnName: "메모", value: text }];
    inputs.forEach(input => {
        updates.push({ columnName: input.getAttribute('data-key'), value: input.value });
    });

    closeModal();
    
    try {
        await fetch(API_URL, { 
            method: "POST", 
            body: JSON.stringify({ 
                rowId: currentEditId, 
                updates: updates 
            })
        });
        init();
    } catch (error) {
        console.error("Save detail error:", error);
        alert(`일부 저장 실패: ${error.message || '네트워크 오류'}`);
        init();
    }
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
    
    // 주거지원 종료일 (+1개월)
    const d1 = new Date(rent);
    d1.setMonth(d1.getMonth() + 1);
    document.getElementById('add-end-date').value = d1.toISOString().split('T')[0];
    
    // 종결예정일 (+3개월)
    const d2 = new Date(rent);
    d2.setMonth(d2.getMonth() + 3);
    document.getElementById('add-term-date').value = d2.toISOString().split('T')[0];
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
