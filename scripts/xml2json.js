var fs = require('fs'),
    xml2js = require('xml2js');
 
var parser = new xml2js.Parser();
fs.readFile(__dirname + '/VistA_FHIR_Map.xml', function(err, data) {
    parser.parseString(data, function (err, result) {
        console.log(JSON.stringify(result));
    });
});