var Fhir = require('fhir').Fhir;
var ParseConformance = require('fhir').ParseConformance;
var FhirVersions = require('fhir').Versions;
var fs = require('fs');
var xml2js = require('xml2js');
var xml = new xml2js.Parser();

// // Get the data
var newValueSets = JSON.parse(fs.readFileSync('definitions/valuesets.json').toString());
var newTypes = JSON.parse(fs.readFileSync('definitions/profiles-types.json').toString());
var newResources = JSON.parse(fs.readFileSync('definitions/profiles-resources.json').toString());

// Create a parser and parse it using the parser
var parser = new ParseConformance(false, FhirVersions.STU3);           // don't load pre-parsed data
parser.parseBundle(newValueSets);
parser.parseBundle(newTypes);
parser.parseBundle(newResources);
var fhir = new Fhir(parser);

// fix ordering of elements in StructureDefinition
// 1. sort order of differential.elements based on officiel resource StructureDefinition
// 2. convert to xml and then convert to json using the Fhir library

if (!fs.existsSync("output/")) {
    console.error("Expecting json files (vfm2sd.js generated) in the script/output folder");
    return;
}
if (!fs.existsSync("../input/resources/")) {
    fs.mkdirSync('../input/resources/');
}

// read order information
let input_fhirProperties_core;
xml.parseString(fs.readFileSync('input/fhirProperties-core.xml'), function (err, result) {
    input_fhirProperties_core = result.dataroot;
});

fs.readdir("output/", (err, files) => {
    files.forEach(filename => {
        if (filename.endsWith(".json")) {
            fixOrder(filename); 
        }
        // ignore the reset
        else {
            console.log("Ignoring: " + filename);
        }
    });
});

function fixOrder(filename) {
    var json = fs.readFileSync("output/" + filename);
    var resource = JSON.parse(json);

    if (resource.resourceType == "StructureDefinition" && resource.type != "Extension") {
        console.log("Fixing differential element order: " + filename);
        
        resource.differential.element.sort(function(a,b) {
            var apath = a.path;
            var bpath = b.path;
            // lookup index(sortkey) paths
            var arow = input_fhirProperties_core.fhirProperties.find(function(row) { return (row.resource+'.'+row.field) == apath; });
            var brow = input_fhirProperties_core.fhirProperties.find(function(row) { return (row.resource+'.'+row.field) == bpath; });
            //console.log(apath + " " + bpath + " " + arow.order + " " + brow.order);
            var aidx = parseInt(arow.order);
            var bidx = parseInt(brow.order);
            return (aidx > bidx) ? 1 : -1 ;
        });
    }
    else {
        console.log("Fixing element order only: " + filename);
    }

    // Call validator optional
    //var result = fhir.validate(resource);
    //console.log("Basic validate result: " + JSON.stringify(result));

    // Fix element order
    var xml = fhir.objToXml(resource);
    var newjson = fhir.xmlToJson(xml);

    fs.writeFileSync("../input/resources/" + filename, newjson);
}