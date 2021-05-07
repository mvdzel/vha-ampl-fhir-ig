const fs = require('fs'),
    xml2js = require('xml2js');
var xml = new xml2js.Parser();

//
// This script will assert the output of the vfm2sd script
//
// confirm map is there
// confirm extension is used
// confirm fixed parameters in resource
// confirm fixed parameters in extension
// count structure definitions
// count extensions
// count valuesets
// count conceptmaps
//

var input_mappings;
xml.parseString(fs.readFileSync('input/VistA_FHIR_Map.xml'), function (err, result) {
    input_mappings = result.dataroot;
});
let profileNames = input_mappings.VistA_FHIR_Map.map(a => a.profile[0]).filter((value, index, self) => self.indexOf(value) === index);
let mapIds = input_mappings.VistA_FHIR_Map.map(a => a.ID[0]).filter((value, index, self) => self.indexOf(value) === index);

console.log ("Input Mappings: " + input_mappings.VistA_FHIR_Map.length);
console.log ("Input Distinct MapIDs: " + mapIds.length);
console.log ("Input Profiles: " + profileNames.length);

if (!fs.existsSync("output/")) {
    console.error("Expecting json files (vfm2sd.js generated) in the script/output folder");
    return;
}

var mappingCount = 0;
var sdMappingCount = 0;
var sdCount = 0;
var extCount = 0;
var vsCount = 0;
var cmCount = 0;
fs.readdir("output/", (err, files) => {
    files.forEach(filename => {
        if (filename.endsWith(".json")) {
            test(filename); 
        }
        // ignore the reset
        else {
            //console.log("Ignoring: " + filename);
        }
    });
    console.log ("Output Mappings: " + mappingCount); // mappings can be duplicated in SD and Ext
    console.log ("Output Mappings (not Extension): " + sdMappingCount);
    console.log ("Output StructureDefinitions: " + sdCount); // not all mappings are in named profiles yet
    console.log ("Output Extensions: " + extCount);
    console.log ("Output ValueSets: " + vsCount);
    console.log ("Output ConceptMaps: " + cmCount);
    console.log ("Output missing mappings: " + mapIds.length + " [" + mapIds.join(',') + "]"); // mapping not complete or correct
});

function test(filename) {
    var json = fs.readFileSync("output/" + filename);
    var resource = JSON.parse(json);

    if (resource.resourceType == "StructureDefinition") {
        // differential.element[].mapping
        // label
        // mustSupport = true
        sdCount++;
        var _mappingCount = 0;
        resource.differential.element.forEach(element => {
            if (element.mapping) {
                _mappingCount += element.mapping.length;
                element.mapping.forEach(mapping => {
                    var mapId =  mapping.map.substring(mapping.map.lastIndexOf(' ') + 1);
                    mapIds = mapIds.filter(e => e !== mapId)
                });
            }
        });
        mappingCount += _mappingCount;
        if (resource.type == "Extension") {
            extCount++;
        } else {
            sdMappingCount += _mappingCount;
        }
    }
    else if (resource.resourceType == "ValueSet") {
        vsCount++;
    }
    else if (resource.resourceType == "ConceptMap") {
        cmCount++;
    }
}