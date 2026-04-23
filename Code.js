/**
 * CareCheck Google Sheets Bridge - Advanced Version
 * Supports: New registration, Deletion, Wednesday Reset, and History Tracking
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  // 1. 메인 명단 가져오기
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1);
  var clients = rows.map(function(row, index) {
    var obj = { rowId: index + 2 };
    headers.forEach(function(header, i) { obj[header] = row[i]; });
    return obj;
  });

  // 2. 상담이력 가져오기 (없으면 생성)
  var historySheet = ss.getSheetByName("상담이력");
  if (!historySheet) {
    historySheet = ss.insertSheet("상담이력");
    historySheet.appendRow(["상담일시", "이름", "성별", "거주지", "사례 관리자"]);
  }
  var historyData = historySheet.getDataRange().getValues().slice(1);

  // 3. 예외명단 가져오기 (없으면 생성)
  var exceptionSheet = ss.getSheetByName("예외명단");
  if (!exceptionSheet) {
    exceptionSheet = ss.insertSheet("예외명단");
    exceptionSheet.getRange(1, 1).setValue("이름");
  }
  var exceptionData = exceptionSheet.getDataRange().getValues().slice(1);
  var exceptions = exceptionData.map(function(row) { return row[0]; }).filter(String);

  // 통합 데이터 전송
  var result = {
    clients: clients,
    history: historyData,
    exceptions: exceptions
  };
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  // 1. 신규 행 추가 모드
  if (params.action === "add") {
    var data = params.data; 
    var lastCol = Math.max(1, sheet.getLastColumn());
    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    var newRow = [];
    Object.keys(data).forEach(function(key) {
      var colIndex = currentHeaders.indexOf(key) + 1;
      if (colIndex === 0) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(key);
        currentHeaders.push(key);
        colIndex = currentHeaders.length;
      }
      newRow[colIndex - 1] = data[key];
    });
    
    sheet.appendRow(newRow);
    return ContentService.createTextOutput("Success Add").setMimeType(ContentService.MimeType.TEXT);
  }
  
  // 2. 행 삭제 모드
  if (params.action === "delete") {
    if (params.rowId > 1) {
      sheet.deleteRow(params.rowId);
      return ContentService.createTextOutput("Success Delete").setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // 3. 예외 명단 추가
  if (params.action === "addException") {
    var exSheet = ss.getSheetByName("예외명단") || ss.insertSheet("예외명단");
    if (exSheet.getLastRow() === 0) exSheet.appendRow(["이름"]);
    exSheet.appendRow([params.name]);
    return ContentService.createTextOutput("Success Add Exception").setMimeType(ContentService.MimeType.TEXT);
  }

  // 4. 예외 명단 제거
  if (params.action === "removeException") {
    var exSheet = ss.getSheetByName("예외명단");
    if (exSheet) {
      var data = exSheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        if (data[i][0] == params.name) {
          exSheet.deleteRow(i + 1);
        }
      }
    }
    return ContentService.createTextOutput("Success Remove Exception").setMimeType(ContentService.MimeType.TEXT);
  }

  // 5. 기존 셀 수정 모드 (단일 또는 복수 업데이트 지원)
  var updates = params.updates || (params.columnName ? [{ columnName: params.columnName, value: params.value }] : []);
  if (updates.length > 0) {
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    updates.forEach(function(update) {
      var colIndex = headers.indexOf(update.columnName) + 1;
      if (colIndex === 0) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(update.columnName);
        headers.push(update.columnName);
        colIndex = headers.length;
      }
      sheet.getRange(params.rowId, colIndex).setValue(update.value);

      // [추가] 상담 완료 시 '상담이력' 시트에 기록
      if (update.columnName === "상담여부" && (update.value === "대면" || update.value === "부재")) {
        var historySheet = ss.getSheetByName("상담이력") || ss.insertSheet("상담이력");
        if (historySheet.getLastRow() === 0) {
          historySheet.appendRow(["상담일시", "이름", "성별", "거주지", "사례 관리자", "상담방식"]);
        }
        var rowData = sheet.getRange(params.rowId, 1, 1, headers.length).getValues()[0];
        historySheet.appendRow([
          new Date(), 
          rowData[headers.indexOf("이름")] || "", 
          rowData[headers.indexOf("성별")] || "", 
          rowData[headers.indexOf("거주지") !== -1 ? headers.indexOf("거주지") : headers.indexOf("주소")] || "", 
          rowData[headers.indexOf("사례 관리자")] || "",
          update.value // '대면' 또는 '부재' 기록
        ]);
      }
    });
    return ContentService.createTextOutput("Success Update").setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService.createTextOutput("No Action").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * [추가] 구글 시트 직접 입력 시 자동 날짜 계산 트리거
 * '월세지원일' 입력 시 '주거지원 종료일(+1m)', '종결예정일(+3m)' 자동 계산
 */
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  
  // 1. 헤더 정보를 읽어 열 위치 파악
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  var rentDateIdx = headers.indexOf("월세지원일") + 1;
  var endDateIdx = headers.indexOf("주거지원 종료일") + 1;
  var termDateIdx = headers.indexOf("종결예정일") + 1;
  
  // 2. 수정된 칸이 '월세지원일' 열이고, 데이터 행(2행 이상)인 경우 작동
  if (range.getColumn() == rentDateIdx && range.getRow() > 1 && rentDateIdx > 0) {
    var rentDateValue = range.getValue();
    
    // 값이 비어있으면 날짜 칸들도 비움
    if (!rentDateValue) {
      if (endDateIdx > 0) sheet.getRange(range.getRow(), endDateIdx).clearContent();
      if (termDateIdx > 0) sheet.getRange(range.getRow(), termDateIdx).clearContent();
      return;
    }
    
    var rentDate = new Date(rentDateValue);
    // 유효한 날짜인지 체크
    if (!isNaN(rentDate.getTime())) {
      // 주거지원 종료일 (+1개월)
      var endDate = new Date(rentDate.getTime());
      endDate.setMonth(endDate.getMonth() + 1);
      if (endDateIdx > 0) sheet.getRange(range.getRow(), endDateIdx).setValue(endDate);
      
      // 종결예정일 (+3개월)
      var termDate = new Date(rentDate.getTime());
      termDate.setMonth(termDate.getMonth() + 3);
      if (termDateIdx > 0) sheet.getRange(range.getRow(), termDateIdx).setValue(termDate);
    }
  }
}