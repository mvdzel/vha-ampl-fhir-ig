/*
 N.B. Output will be csv, import using "Text" for all column types and Semicolon (;) as separator and " as string delimiter

 18-oct-2019 v1 initial go
 19-oct-2019 v2 added the '.' field#s
 03-nov-2019 v3 added valuesets
 10-may-2021 v4 removed 'B' lines
*/

const readline = require('readline');

const fs = require('fs');

const readInterface = readline.createInterface({
    input: fs.createReadStream('/tmp/DD.zwr'),
//    output: process.stdout,
    console: false
});

currentField = {
    filenum: "file#",
    fieldnum: "field#",
    name: "name", // 0,0
    type: "type", // 0,1
    valueset: "valueset", // 0,2
    description: "description", // 21,#
    help_prompt: "help_prompt", // 3
    last_edited: "last_edited" // "DX"
 };

readInterface.on('line', function(line) {
    //console.log(line);

    var parts = line.match(/^\^DD\(([^\)]+)\)="(.+)"/);
    if (parts) {
        var key = parts[1];
        var value = parts[2];
        var parts2 = key.split(',');
        var _filenum = parts2[0];
        var _fieldnum = parts2[1];
        var _linetype = parts2[2];
        // if(_filenum == "52") {
            // console.log("DEBUG: key=" + key);
            // console.log("DEBUG: value=" + value);
        // }

        // skip filenum 0 and fieldnum 0
        if (_filenum == "0" || _fieldnum == "\"B\"") return;

        // is this line for a the next field then output the previous line
        if (_filenum != currentField.filenum || _fieldnum != currentField.fieldnum) {
            if (currentField.type != 'S' && currentField.type != 'RS') {
                currentField.valueset = "";
            }
            else {
                currentField.valueset = currentField.valueset.replace(/;/g,'\n');
            }
            console.log(currentField.filenum+";"+currentField.fieldnum+";\""+currentField.name+"\";"+currentField.type+";\""+currentField.valueset+"\";\""+currentField.description+"\";\""+currentField.help_prompt+"\"");
            currentField = {
                filenum: _filenum,
                fieldnum: _fieldnum,
                name: "", // 0
                type: "", // 0
                valueset: "", // 0 if type = 'S' or 'RS'
                description: "", // 21,#
                help_prompt: "", // 3
                last_edited: "" // 'DX'
             };
        }

        // proces attributes for the current field
        switch(_linetype) {
            case "0":
                var parts3 = value.split('^');
                currentField.name = parts3[0];
                currentField.type = parts3[1];
                currentField.valueset = parts3[2];
                break;
            case "3":
                currentField.help_prompt = value;
                break;
            case "21":
                if (parts2[3] != "0") { // Skip first and append following lines
                    currentField.description += value + " ";
                }
                break;
	        case undefined:
                var parts3 = value.split('^');
                currentField.name = parts3[0];
		        currentField.name = parts3[0];
		        break;
        }
    }
});
