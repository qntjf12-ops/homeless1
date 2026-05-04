/**
 * CareCheck Google Sheets Bridge - Advanced Version
 * Supports: New registration, Deletion, Wednesday Reset, and History Tracking
 */

function doGet(e) {
  try {
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
      historySheet.appendRow(["상담일시", "이름", "성별", "거주지", "사례 관리자", "상담방식"]);
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
      status: "success",
      clients: clients,
      history: historyData,
      exceptions: exceptions
    };
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}


function doPost(e) {
  try {
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
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Success Add"})).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. 행 삭제 모드
    if (params.action === "delete") {
      if (params.rowId > 1) {
        sheet.deleteRow(params.rowId);
        return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Success Delete"})).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 3. 예외 명단 추가
    if (params.action === "addException") {
      var exSheet = ss.getSheetByName("예외명단") || ss.insertSheet("예외명단");
      if (exSheet.getLastRow() === 0) exSheet.appendRow(["이름"]);
      exSheet.appendRow([params.name]);
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Success Add Exception"})).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. 예외 명단 제거
    if (params.action === "removeException") {
      var exSheet = ss.getSheetByName("예외명단");
      if (exSheet) {
        var exDataList = exSheet.getDataRange().getValues();
        for (var i = exDataList.length - 1; i >= 1; i--) {
          if (exDataList[i][0] == params.name) {
            exSheet.deleteRow(i + 1);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Success Remove Exception"})).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. 수동 리셋 모드
    if (params.action === "manualReset") {
      var lastColUpdated = sheet.getLastColumn();
      var headersLine = sheet.getRange(1, 1, 1, lastColUpdated).getValues()[0];
      var checkColIdx = headersLine.indexOf("상담여부") + 1;
      var dateColIdx = headersLine.indexOf("상담일자") + 1;
      
      if (checkColIdx > 0 && sheet.getLastRow() > 1) sheet.getRange(2, checkColIdx, sheet.getLastRow() - 1, 1).clearContent();
      if (dateColIdx > 0 && sheet.getLastRow() > 1) sheet.getRange(2, dateColIdx, sheet.getLastRow() - 1, 1).clearContent();

      var historySheet = ss.getSheetByName("상담이력") || ss.insertSheet("상담이력");
      if (historySheet.getLastRow() === 0) {
        historySheet.appendRow(["상담일시", "이름", "성별", "거주지", "사례 관리자", "상담방식"]);
      }
      var today = new Date();
      historySheet.appendRow([today, "시스템", "-", "-", "-", "수동 리셋"]);

      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Success Manual Reset"})).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. 기존 셀 수정 모드 (단일 또는 복수 업데이트 지원)
    var updates = params.updates || (params.columnName ? [{ columnName: params.columnName, value: params.value }] : []);
    if (updates.length > 0) {
      var lastColUpdated = sheet.getLastColumn();
      var headersLine = sheet.getRange(1, 1, 1, lastColUpdated).getValues()[0];

      updates.forEach(function(update) {
        var colIndex = headersLine.indexOf(update.columnName) + 1;
        if (colIndex === 0) {
          sheet.getRange(1, sheet.getLastColumn() + 1).setValue(update.columnName);
          headersLine.push(update.columnName);
          colIndex = headersLine.length;
        }
        sheet.getRange(params.rowId, colIndex).setValue(update.value);

        // [추가] 상담 완료 시 '상담이력' 시트에 기록
        if (update.columnName === "상담여부") {
          var historySheet = ss.getSheetByName("상담이력") || ss.insertSheet("상담이력");
          if (historySheet.getLastRow() === 0) {
            historySheet.appendRow(["상담일시", "이름", "성별", "거주지", "사례 관리자", "상담방식"]);
          }
          var rowData = sheet.getRange(params.rowId, 1, 1, headersLine.length).getValues()[0];
          var targetName = rowData[headersLine.indexOf("이름")] || "";
          
          var today = new Date();
          var todayStr = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
          
          var historyData = historySheet.getDataRange().getValues();
          var updated = false;
          
          if (update.value === "대면" || update.value === "부재") {
            // 역순으로 탐색하여 오늘 남긴 같은 이름의 기록이 있으면 업데이트
            for (var i = historyData.length - 1; i > 0; i--) {
              var hRow = historyData[i];
              if (!hRow[0]) continue;
              var hDate = new Date(hRow[0]);
              if (isNaN(hDate.getTime())) continue;
              var hDateStr = hDate.getFullYear() + "-" + (hDate.getMonth() + 1) + "-" + hDate.getDate();
              var hName = hRow[1];
              
              if (hName === targetName && hDateStr === todayStr) {
                historySheet.getRange(i + 1, 1).setValue(today);
                historySheet.getRange(i + 1, 6).setValue(update.value);
                updated = true;
                break;
              }
            }
            
            if (!updated) {
              historySheet.appendRow([
                today, 
                targetName, 
                rowData[headersLine.indexOf("성별")] || "", 
                rowData[headersLine.indexOf("거주지") !== -1 ? headersLine.indexOf("거주지") : headersLine.indexOf("주소")] || "", 
                rowData[headersLine.indexOf("사례 관리자")] || "",
                update.value // '대면' 또는 '부재' 기록
              ]);
            }
          } else {
            // 체크를 해제한 경우 (값이 비어있거나 다른 값일 때), 오늘 기록이 있으면 삭제
            for (var i = historyData.length - 1; i > 0; i--) {
              var hRow = historyData[i];
              if (!hRow[0]) continue;
              var hDate = new Date(hRow[0]);
              if (isNaN(hDate.getTime())) continue;
              var hDateStr = hDate.getFullYear() + "-" + (hDate.getMonth() + 1) + "-" + hDate.getDate();
              var hName = hRow[1];
              
              if (hName === targetName && hDateStr === todayStr) {
                historySheet.deleteRow(i + 1);
                break; // 하루치 1개만 삭제하면 되므로 종료
              }
            }
          }
        }
      });
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Success Update"})).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({status: "ignored", message: "No Action"})).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
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