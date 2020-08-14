var fs = require('fs');

const MAX_DEPTH = 2;

let fhirResources = JSON.parse(fs.readFileSync('definitions/profiles-resources.json'));
var resourceEntries = fhirResources.entry.filter(entry => entry.resource.kind === "resource" && entry.resource.abstract === false);
let fhirTypes = JSON.parse(fs.readFileSync('definitions/profiles-types.json'));
var typeEntries = fhirTypes.entry.filter(entry => (entry.resource.kind === "complex-type" || entry.resource.kind === "primitive-type") && entry.resource.abstract === false);

console.log('<?xml version="1.0" encoding="UTF-8"?><dataroot>');
resourceEntries.forEach(entry => {
    // resourceNames
    console.error (entry.resource.type);
    // textKey
    entry.resource.snapshot.element.forEach(element => {
        if (element.type) {
            var card = element.min + ".." + element.max;
            if (element.path.endsWith("[x]")) {
                fhirProperties(element.path, undefined, card, 'multi-type');
            }
            var typesDone = [];
            element.type.forEach(type => {
                // Account for Reference to different profiles
                if (typesDone.indexOf(type.code) == -1) {
                    typesDone.push(type.code);
                    recurseType(element.path, card, type.code, 0);
                }
            });
        }
    });
});
console.log("</dataroot>");

function recurseType(elementPath, card, typeCode, depth)
{
    // never mapped to parts of these types; stop here
    if (typeCode == "Meta" || typeCode == "Extension" || typeCode == "Narrative" || typeCode == "BackboneElement" || typeCode == "Element" || typeCode == "Resource") { 
        fhirProperties(elementPath, typeCode, card, 'X');
        return; 
    }

    if (elementPath.endsWith("[x]")) {
        // shop off [x] and add uppercased type
        var _elemenPath = elementPath.substring(0, elementPath.length-3) + typeCode.substring(0,1).toUpperCase() + typeCode.substring(1);
        elementPath = _elemenPath;
    }
    var typeEntry = typeEntries.find(entry => entry.resource.type === typeCode);
    if (typeEntry) {
        if (typeEntry.resource.kind == "primitive-type") {
            fhirProperties(elementPath, typeCode, card, 'primitive-type');
        }
        else {
            if (depth > MAX_DEPTH) {
                // to deep; stop here
                fhirProperties(elementPath, typeCode, card, '∞');
                return;
            }
            fhirProperties(elementPath, typeCode, card, 'complex-type');
            typeEntry.resource.snapshot.element.forEach(typeElement => {
                // chop off type
                var typePath = typeElement.path.substring(typeCode.length);
                var elementPathWithTypePath = elementPath + typePath;
                if (elementPathWithTypePath.endsWith("[x]")) {
                    fhirProperties(elementPathWithTypePath, undefined, card, 'multi-type');
                }
                if (typeElement.type) { 
                    var typesDone = [];
                    typeElement.type.forEach(type => {
                        // Account for Reference to different profiles
                        if (typesDone.indexOf(type.code) == -1) {
                            typesDone.push(type.code);
                            var typeCard = typeElement.min + ".." + typeElement.max;
                            recurseType (elementPathWithTypePath, typeCard, type.code, depth+1);
                        }
                    });
                }
            });
        }
    }
    else {
        console.error (elementPath + "[" + card + "] = " + typeCode + " NOT FOUND");
    }
}

/*
<fhirProperties>
<id>174</id>
<resource>Observation</resource>
<field>value[x]</field>
<flag>Σ</flag>
<order>15</order>
<card>0..1</card>
<version>DSTU2</version>
<scope>core</scope>
<textkey>Observation.value[x]</textkey>
</fhirProperties>
*/
function fhirProperties(elementPath, typeCode, card, flag) {
    var firstDot = elementPath.indexOf('.');
    var resource = elementPath.substring(0, firstDot);
    var field = elementPath.substring(firstDot + 1);
    var output = `<fhirProperties><resource>${resource}</resource><field>${field}</field><card>${card}</card>`;
    if (typeCode) output += `<type>${typeCode}</type>`;
    output += `<version>STU3</version><scope>core</scope><textkey>${elementPath}</textkey></fhirProperties>`;
    console.log(output);
}