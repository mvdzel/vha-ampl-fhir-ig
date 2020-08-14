var Fhir = require('fhir').Fhir;
var ParseConformance = require('fhir').ParseConformance;
var FhirVersions = require('fhir').Versions;
var fs = require('fs');

// // Get the data
var newValueSets = JSON.parse(fs.readFileSync('definitions/valuesets.json').toString());
var newTypes = JSON.parse(fs.readFileSync('definitions/profiles-types.json').toString());
var newResources = JSON.parse(fs.readFileSync('definitions/profiles-resources.json').toString());

// // Create a parser and parse it using the parser
var parser = new ParseConformance(false, FhirVersions.STU3);           // don't load pre-parsed data
parser.parseBundle(newValueSets);
parser.parseBundle(newTypes);
parser.parseBundle(newResources);
var fhir = new Fhir(parser);

// fix ordering
var json = fs.readFileSync("/home/michael/eclipse-workspace/vha-ampl-fhir-ig/input/resources/StructureDefinition-PatientRecordFlag.json");
var resource = JSON.parse(json);
var result = fhir.validate(resource);
console.log(result);

var xml = fhir.objToXml(resource);
var newjson = fhir.xmlToJson(xml);
console.log(newjson);
