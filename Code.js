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
  
  // 3. 기존 셀 수정 모드 + 이력 누적
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIndex = headers.indexOf(params.columnName) + 1;
  
  if (colIndex === 0) {
    sheet.getRange(1, lastCol + 1).setValue(params.columnName);
    colIndex = lastCol + 1;
  }
  
  sheet.getRange(params.rowId, colIndex).setValue(params.value);

  // [추가] 상담 완료 시 '상담이력' 시트에 누적 기록
  if (params.columnName === "상담여부" && (params.value === "V" || params.value === "O")) {
    var historySheet = ss.getSheetByName("상담이력") || ss.insertSheet("상담이력");
    if (historySheet.getLastRow() === 0) {
      historySheet.appendRow(["상담일시", "이름", "성별", "거주지", "사례 관리자"]);
    }
    
    // 현재 행의 기본 정보 가져오기
    var rowData = sheet.getRange(params.rowId, 1, 1, lastCol).getValues()[0];
    var nameIdx = headers.indexOf("이름");
    var sexIdx = headers.indexOf("성별");
    var addrIdx = headers.indexOf("거주지") !== -1 ? headers.indexOf("거주지") : headers.indexOf("주소");
    var managerIdx = headers.indexOf("사례 관리자");

    historySheet.appendRow([
      new Date(), 
      rowData[nameIdx] || "", 
      rowData[sexIdx] || "", 
      rowData[addrIdx] || "", 
      rowData[managerIdx] || ""
    ]);
  }

  return ContentService.createTextOutput("Success Update").setMimeType(ContentService.MimeType.TEXT);
}