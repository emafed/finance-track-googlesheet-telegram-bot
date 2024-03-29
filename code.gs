function doGet(e) {
    return HtmlService.createHtmlOutput("Ciao!");
}

function sendMessage(chat_id, text, opt=true, data) {
    var options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(data)
    };
    var url = telegramUrl + "/sendMessage?chat_id=" + chat_id + "&text=" + text;
    try {
      var response
      if (opt) { response = UrlFetchApp.fetch(url, options)
      } else { response = UrlFetchApp.fetch(url) }
      PropertiesService.getScriptProperties().setProperty('MsgId', JSON.parse(response.getContentText()).result.message_id)
    } catch (e) {
      mailLogger("Error Log", e)
      sheetLogger(e)
    }
}

function doPost(e) {
    var contents = JSON.parse(e.postData.contents);

    if (contents.message != undefined) {
        var chat_id = contents.message.from.id
        var username = contents.message.from.username
        if ((chat_id != myChatId) || (username != myUsername)) {
          mailLogger("#### ATTENZIONE ####", contents)
          sheetLogger("#### ATTENZIONE #### " + JSON.stringify(contents))
          return false
        }
        var check = (isNumeric(contents.message.text) && 
          PropertiesService.getScriptProperties().getProperty('Primaria') != "" &&
          PropertiesService.getScriptProperties().getProperty('Secondaria') != "") ||
          (PropertiesService.getScriptProperties().getProperty('Secondaria') == "Benzina")

        if (contents.message.text.localeCompare("/start") == 0) {
            reset();
            deleteMessage(chat_id, contents.message.message_id)
            sendMessage(chat_id, "Ciao!", true, Comandi)
        } else if (contents.message.text.localeCompare("/reset") == 0){
            deleteMessage(chat_id, contents.message.message_id)
            if (PropertiesService.getScriptProperties().getProperty('MsgId') != "" ){
              deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
            }
            reset()
        } else if (PropertiesService.getScriptProperties().getProperty('LastMsg') == "Importo" && check) {
            try {
              var primaria = PropertiesService.getScriptProperties().getProperty('Primaria')
              var secondaria = PropertiesService.getScriptProperties().getProperty('Secondaria')
              var descrizione = PropertiesService.getScriptProperties().getProperty('Descrizione')
              var importo;

              //  controllo se devo inseririre anche la benzina
              if(secondaria == "Benzina"){
                var res = (contents.message.text).split("-")
                if(res.length != 3){throw "Formato benzina non corretto"}
                importo = parseFloat(res[0])
                inserisciBenzina(importo, parseFloat(res[1]), parseFloat(res[2]))
              }else{
                importo = parseFloat(contents.message.text)
              }

              //  elimino il messaggio precedente e il messaggio con l'importo
              deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
              deleteMessage(chat_id, contents.message.message_id);
            
              var lRow = sheet.getLastRow();
              var lCol = sheet.getLastColumn()
              var range = sheet.getRange(lRow, 1, 1, lCol);
              var formulas = range.getFormulas();
              sheet.insertRowsAfter(lRow, 1);
              newRange = sheet.getRange(lRow + 1, 1, 1, lCol);
              newRange.setFormulas(formulas);

              //  imposto la validation corretta
              sheet.getRange(lRow + 1, 4, 1).setDataValidation(null)
              var dataValidation = SpreadsheetApp.newDataValidation().requireValueInRange(sheet.getRange(primaria)).build()
              sheet.getRange(lRow + 1, 4, 1).setDataValidation(dataValidation)

              //  inserimento dei dati
              sheet.getRange(lRow + 1, 1, 1).setValue(importo);
              sheet.getRange(lRow + 1, 2, 1).setValue(Utilities.formatDate(new Date(), 'GMT+1', 'dd'));
              sheet.getRange(lRow + 1, 3, 1).setValue(primaria);
              sheet.getRange(lRow + 1, 4, 1).setValue(secondaria);
              sheet.getRange(lRow + 1, 5, 1).setValue(descrizione);
              //  timestamp
              sheet.getRange(lRow + 1, 6, 1).setValue(Utilities.formatDate(new Date(), 'GMT+1', 'dd/MM/yy, HH:mm:ss'));

              

              var answer = "Inserimento effettuato!%0A"
              answer += primaria + " ("
              answer += secondaria + ") : "
              answer += importo + " €%0A"
              answer += descrizione + "%0A%0A" + getRiepilogoMensile("corrente")
              sendMessage(chat_id, answer, true, afterInsertButton)

            } catch (e) {
                reset()
                sendMessage(chat_id, "Inserimento fallito!", false);
            }
        } else if (PropertiesService.getScriptProperties().getProperty('LastMsg') == "Descrizione") {
            var cat_secondaria = PropertiesService.getScriptProperties().getProperty('Secondaria')
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
            deleteMessage(chat_id, contents.message.message_id);

            //  imposto la descrizione
            let descrizione = contents.message.text
            PropertiesService.getScriptProperties().setProperty('Descrizione', descrizione);
            PropertiesService.getScriptProperties().setProperty('LastMsg', "Importo");
            var answer = (cat_secondaria == "Benzina")?"Inserisci importo (€-km-€l)":"Inserisci importo"
            sendMessage(chat_id, answer, false);
        } else {
          deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
          deleteMessage(chat_id, contents.message.message_id);
          reset()
          sendMessage(chat_id, "Inserimento fallito!", false);
        }
    } else if (contents.callback_query != undefined) {
        var chat_id = contents.callback_query.from.id;
        if (chat_id != myChatId) {
            return false
        }
        
        if(contents.callback_query.message.text.startsWith("Ciao")){
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
            if(contents.callback_query.data == "AGGIUNGI MOVIMENTO"){
              sendMessage(chat_id, "Categoria primaria:", true, Primaria);
            }else if(contents.callback_query.data == "MESE"){
              sendMessage(chat_id, getRiepilogoMensile("corrente"), true, OnlyOKButton);
            }else if(contents.callback_query.data == "ULTIMI MOVIMENTI"){
              sendMessage(chat_id, getUltimiMovimenti(), true, UltimiMovimenti);
            }else if(contents.callback_query.data == "MESE PRECEDENTE"){
              sendMessage(chat_id, getRiepilogoMensile("precedente"), true, OnlyOKButton);
            }else if(contents.callback_query.data == "PORTAFOGLIO"){
              sendMessage(chat_id, getPortafoglio(), true, OnlyOKButton);
            } else if(contents.callback_query.data == "CHIUDI"){
              reset()
              deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'))
            }      
        }else if(contents.callback_query.data == "AGGIUNGI MOVIMENTO"){
            //  dopo aver fatto un inserimento
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
            sendMessage(chat_id, "Categoria primaria:", true, Primaria);
        } else if(contents.callback_query.data == "OK"){
            //  torno alla home
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
            reset()
            sendMessage(chat_id, "Ciao!", true, Comandi);
        } else if(contents.callback_query.data == "ELIMINA ULTIMO"){
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));
            var answer, btn
            if( eliminaUltimoMovimento() ){ 
              answer = "Movimento eliminato!%0A" 
              answer += "%0A%0A" + getUltimiMovimenti()
              btn = UltimiMovimenti
            } else { 
              answer = "Nessun movimento da eliminare"
              btn = OnlyOKButton
            }
            sendMessage(chat_id, answer, true, btn)
            
        } else if (contents.callback_query.message.text == "Categoria primaria:") {
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));

            //  dopo aver impostato la categoria primaria chiedo la secondaria
            let cat_primaria = contents.callback_query.data
            PropertiesService.getScriptProperties().setProperty('Primaria', cat_primaria);
            var answer = "Categoria secondaria:";
            sendMessage(chat_id, answer, true, Secondaria[cat_primaria]);

        } else if (contents.callback_query.message.text == "Categoria secondaria:") {
            deleteMessage(chat_id, PropertiesService.getScriptProperties().getProperty('MsgId'));

            //  imposto la categoria secondaria
            let cat_secondaria = contents.callback_query.data
            PropertiesService.getScriptProperties().setProperty('Secondaria', cat_secondaria);
            //  lo devo salvare per inteccettare la risposta
            PropertiesService.getScriptProperties().setProperty('LastMsg', "Descrizione");
            sendMessage(chat_id, "Descrizione:", false);
        }
    }
  sheetLogger(JSON.stringify(contents))
}

function setWebhook() {
    var url = telegramUrl + "/setWebhook?url=" + webAppUrl;
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

function getMe() {
    var url = telegramUrl + "/getMe";
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

function getUpdates() {
    var url = telegramUrl + "/getUpdates";
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

function getMyCommands() {
    var url = telegramUrl + "/getMyCommands";
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

function mailLogger(subject, content) {
    GmailApp.sendEmail(myEmail, subject, JSON.stringify(content));
}

function isNumeric(str) {
    if (typeof str != "string")
        return false
    return !isNaN(str) && !isNaN(parseFloat(str))
}

function reset() {
    PropertiesService.getScriptProperties().setProperty('MsgId', "");
    PropertiesService.getScriptProperties().setProperty('Primaria', "");
    PropertiesService.getScriptProperties().setProperty('Secondaria', "");
    PropertiesService.getScriptProperties().setProperty('Descrizione', "");
    PropertiesService.getScriptProperties().setProperty('LastMsg', "");
}

function deleteMessage(chatId, msgId) {
    var options = {
          'method': 'post',
          'contentType': 'application/json',
          'payload': JSON.stringify( { chat_id: chatId, message_id: msgId } )
      };
    var url = telegramUrl + "/deleteMessage";
    UrlFetchApp.fetch(url, options);
}

function getPortafoglio(){
  let sheetPAC = SpreadsheetApp.getActive().getSheetByName('PAC')
  let sheetPTF = SpreadsheetApp.getActive().getSheetByName('PORTAFOGLIO')

  let ret = "--------------------- %0A"
  ret += "PAC %0A"
  ret += "Commissioni: " + getValueFormatted(sheetPAC.getRange(1, 12)) + " €%0A"
  ret += "VWCE: " + getValueFormatted(sheetPAC.getRange(2, 12)) + " €%0A"
  ret += "Quote: " + (sheetPAC.getRange(3, 12).getValue()) + " %0A"
  ret += "Prezzo medio: " + getValueFormatted(sheetPAC.getRange(4, 12)) + " €%0A"
  ret += "Costo totale: " + getValueFormatted(sheetPAC.getRange(5, 12)) + " €%0A"
  ret += "%0A"
  ret += "Valore: " + getValueFormatted(sheetPAC.getRange(6, 12)) + " €%0A"
  ret += "%0A"
  ret += "Prof.: " + getValueFormatted(sheetPAC.getRange(8, 12)) + " €"
  ret += " [" + ((sheetPAC.getRange(9, 12).getValue()) * 100).toFixed(2) + " %25]%0A"
  ret += "--------------------- %0A"
  ret += "AUTO %0A"
  ret += getValueFormatted(sheetPTF.getRange(4, 2)) + " €%0A"
  ret += "--------------------- %0A"
  ret += "CRIPTO %0A"
  ret += getValueFormatted(sheetPTF.getRange(3, 2)) + " €%0A"
  ret += "--------------------- %0A"
  ret += "LIQUIDITA %0A"
  ret += "Prec: " + getValueFormatted(sheetPTF.getRange(1, 2)) + " €%0A"
  ret += "Mese: " + getValueFormatted(sheetPTF.getRange(1, 3)) + " €%0A"
  ret += "Stima: " + getValueFormatted(sheetPTF.getRange(1, 4)) + " €%0A"
  ret += "--------------------- %0A"
  ret += "TOTALE " + getValueFormatted(sheetPTF.getRange(6, 4)) + " €%0A"
  
  return ret
}

function getValueFormatted(e){
  return (e.getValue()).toLocaleString('it-IT')
}

function getRiepilogoMensile(tipo){
  var rowMese, nome;
  var sheetRiepilogo = spreadsheet.getSheetByName(anno);
  if(tipo == "corrente"){
    rowMese = 3 + mese
    nome = nomeMese
  }else if(tipo == "precedente"){
    if(mese == 0){
      return "Mese precedente non disponibile"
    }else{
      rowMese = 3 + (mese - 1)
      nome = mesi[(mese - 1)]
    }
  }

  let Tot = sheetRiepilogo.getRange(35, rowMese).getValue()
  Tot = Tot!=""?Tot.toLocaleString('it-IT'):Tot
  let TotInv = sheetRiepilogo.getRange(36, rowMese).getValue()
  TotInv = TotInv!=""?TotInv.toLocaleString('it-IT'):TotInv
  let Perc = sheetRiepilogo.getRange(37, rowMese).getValue()
  Perc = Perc!=""?((Perc * 100).toFixed(2)):Perc
  let PercInv = sheetRiepilogo.getRange(38, rowMese).getValue()
  PercInv = PercInv!=""?((PercInv * 100).toFixed(2)):PercInv

  var ge = groupedExpenses()

  var ret = "Spesi oggi: " + ge.todayExpenses + " €%0A"
  ret += "Ultimi 7 giorni: " + ge.lastSevenDaysExpenses + " €%0A"
  ret += "------------------------------%0A"
  ret += "RIEPILOGO " + nome + " %0A"
  ret += "------------------------------%0A"
  ret += "Spesa: " + getValueFormatted(sheetRiepilogo.getRange(2, rowMese)) + " €%0A"
  ret += "%3E Casa: " + getValueFormatted(sheetRiepilogo.getRange(3, rowMese)) + " €%0A"
  ret += "%3E Cibo: " + getValueFormatted(sheetRiepilogo.getRange(4, rowMese)) + " €%0A"
  ret += "%3E Bagno: " + getValueFormatted(sheetRiepilogo.getRange(5, rowMese)) + " €%0A"
  ret += "%3E Vestiti: " + getValueFormatted(sheetRiepilogo.getRange(6, rowMese)) + " €%0A"
  ret += "%3E Sport: " + getValueFormatted(sheetRiepilogo.getRange(7, rowMese)) + " €%0A"
  ret += "%3E Svago: " + getValueFormatted(sheetRiepilogo.getRange(8, rowMese)) + " €%0A"
  ret += "%3E Trasporti: " + getValueFormatted(sheetRiepilogo.getRange(9, rowMese)) + " €%0A"
  ret += "%3E Altro: " + getValueFormatted(sheetRiepilogo.getRange(10, rowMese)) + " €%0A"
  ret += "%0A"

  ret += "Macchina: " + getValueFormatted(sheetRiepilogo.getRange(11, rowMese)) + " €%0A"
  ret += "%3E Benzina: " + getValueFormatted(sheetRiepilogo.getRange(12, rowMese)) + " €%0A"
  ret += "%3E Manutenzione: " + getValueFormatted(sheetRiepilogo.getRange(13, rowMese)) + " €%0A"
  ret += "%3E Altro: " + getValueFormatted(sheetRiepilogo.getRange(14, rowMese)) + " €%0A"
  ret += "%0A"

  ret += "Viaggi: " + getValueFormatted(sheetRiepilogo.getRange(15, rowMese)) + " €%0A"
  ret += "%3E Trasporti: " + getValueFormatted(sheetRiepilogo.getRange(16, rowMese)) + " €%0A"
  ret += "%3E Casa: " + getValueFormatted(sheetRiepilogo.getRange(17, rowMese)) + " €%0A"
  ret += "%3E Cibo: " + getValueFormatted(sheetRiepilogo.getRange(18, rowMese)) + " €%0A"
  ret += "%3E Attivita: " + getValueFormatted(sheetRiepilogo.getRange(19, rowMese)) + " €%0A"
  ret += "%3E Altro: " + getValueFormatted(sheetRiepilogo.getRange(20, rowMese)) + " €%0A"
  ret += "%0A"
  
  ret += "Altro: " + getValueFormatted(sheetRiepilogo.getRange(21, rowMese)) + " €%0A"
  ret += "%0A"

  ret += "TOT: " + getValueFormatted(sheetRiepilogo.getRange(23, rowMese)) + " €%0A"
  ret += "------------------------------%0A"
  ret += "Investimenti: " + getValueFormatted(sheetRiepilogo.getRange(28, rowMese)) + " €%0A"
  ret += "------------------------------%0A"
  ret += "Entrate: " + getValueFormatted(sheetRiepilogo.getRange(33, rowMese)) + " €%0A"
  ret += "------------------------------%0A"
  ret += "Tot: " + Tot + " € [" + Perc + "%25] %0A"
  ret += "Tot (inv): " + TotInv + " € [" + PercInv + "%25]"
  return ret
}

function groupedExpenses(){
  var today = Utilities.formatDate(new Date(), 'GMT+1', 'dd')
  var todayExpenses = 0
  var lastSevenDaysExpenses = 0
  var values = sheet.getRange("A2:C"+sheet.getLastRow()).getValues()
  for (var i in values) {
    if(values[i][2] != "Entrate" && values[i][2] != "Investimenti"){
      if ((parseInt(today)-7) < parseInt(values[i][1])){
        lastSevenDaysExpenses += values[i][0]
      }
      if (parseInt(today) == parseInt(values[i][1])){
        todayExpenses += values[i][0]
      }
    }
  }
  return {
    "todayExpenses": todayExpenses.toLocaleString('it-IT'),
    "lastSevenDaysExpenses": lastSevenDaysExpenses.toLocaleString('it-IT')
  }
}

function sheetLogger(data){
  sheetLOG.insertRowsAfter(1, 1);
  sheetLOG.getRange(2, 1).setValue(Utilities.formatDate(new Date(), 'GMT+1', 'dd/MM/yy, HH:mm:ss'))
  sheetLOG.getRange(2, 2).setValue(data)
}

function deleteLog(){
  sheetLOG.deleteRows(2, sheetLOG.getLastRow())
}

function getUltimiMovimenti(){
  const nMov = 17;
  var ret = "", lRow = sheet.getLastRow(), start = 0;
  if(lRow>nMov){
    start = lRow-nMov;
    ret = "[..." + start + "...]%0A"
  }
  for(var i=start; i<(lRow-1);i++){
    var giorno = sheet.getRange(i+2, 2, 1, 1).getValue()
    var data = creaData(giorno,mese+1)
    ret += "[" + data + "] "
    ret += sheet.getRange(i+2, 3).getValue() + " ("
    ret += sheet.getRange(i+2, 4).getValue() + ") - "
    ret += sheet.getRange(i+2, 5).getValue() + " : "
    ret += getValueFormatted(sheet.getRange(i+2, 1)) + " €%0A"
  }
  if(ret == ""){ ret = "Nessun movimento questo mese" }
  else {
    var ge = groupedExpenses()

    ret += "------------------------------%0A"
    ret += "Spesi oggi: " + ge.todayExpenses + " €%0A"
    ret += "Ultimi 7 giorni: " + ge.lastSevenDaysExpenses + " €%0A"
  }
  return ret;
}

function eliminaUltimoMovimento(){
  var last = sheet.getLastRow()
  if(last>1){
    sheet.deleteRow(last)
    return true
  } else {
    return false
  }
}

function inserisciBenzina(importo, km, prezzo){
  var lRow = benzSheet.getLastRow();
  var lCol = benzSheet.getLastColumn()
  var range = benzSheet.getRange(lRow, 1, 1, lCol);
  var formulas = range.getFormulasR1C1();
  benzSheet.insertRowsAfter(lRow, 1);
  newRange = benzSheet.getRange(lRow + 1, 1, 1, lCol);
  newRange.setFormulasR1C1(formulas);

  benzSheet.getRange(lRow + 1, 1, 1).setValue(Utilities.formatDate(new Date(), 'GMT+1', 'dd/MM/yy'));
  benzSheet.getRange(lRow + 1, 2, 1).setValue(importo);
  benzSheet.getRange(lRow + 1, 3, 1).setValue(km);
  benzSheet.getRange(lRow + 1, 4, 1).setValue(prezzo);
  
}

function creaData(g,m,y){
  let ret = (numDigits(g) == 1 ? ("0" + g) : g) + "/" +
    (numDigits(m) == 1 ? ("0" + m) : m)
  if(y != undefined){
    ret +=  "/" + y
  }
  return ret
}

function numDigits(x) {
  return Math.max(Math.floor(Math.log10(Math.abs(x))), 0) + 1;
}
