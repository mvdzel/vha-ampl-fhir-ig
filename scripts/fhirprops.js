var fs = require('fs');

let fhirResources = JSON.parse(fs.readFileSync('definitions/profiles-resources.json'));
var resourceEntries = fhirResources.entry.filter(entry => entry.resource.kind === "resource" && entry.resource.abstract === false);
let fhirTypes = JSON.parse(fs.readFileSync('definitions/profiles-types.json'));
var typeEntries = fhirTypes.entry.filter(entry => (entry.resource.kind === "complex-type" || entry.resource.kind === "primitive-type") && entry.resource.abstract === false);
resourceEntries.forEach(entry => {
    // resourceNames
    console.log (entry.resource.type);
    // textKey
    entry.resource.snapshot.element.forEach(element => {
        if (element.type) {
            var typesDone = [];
            element.type.forEach(type => {
                // Account for Reference to different profiles
                if (typesDone.indexOf(type.code) == -1) {
                    typesDone.push(type.code);
                    recurseType(element.path, type.code, 0);
                }
            });
        }
    });
});

function recurseType(elementPath, typeCode, depth)
{
    // never mapped to parts of these types
    if (typeCode == "Meta" || typeCode == "Extension" || typeCode == "Narrative" || typeCode == "BackboneElement" || typeCode == "Element" || typeCode == "Resource") { 
        console.log(elementPath + " = " + typeCode + " (X)");
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
            console.log(elementPath + " = " + typeCode + " (P)");
        }
        else {
            if (depth == 2) {
                console.log (elementPath + " = " + typeCode + " (∞)");
                return;
            }
            console.log (elementPath + " = " + typeCode);
            typeEntry.resource.snapshot.element.forEach(typeElement => {
                // chop off type
                var typePath = typeElement.path.substring(typeCode.length);
                var elementPathWithTypePath = elementPath + typePath;
                if (typeElement.type) {
                    var typesDone = [];
                    typeElement.type.forEach(type => {
                        // Account for Reference to different profiles
                        if (typesDone.indexOf(type.code) == -1) {
                            typesDone.push(type.code);
                            recurseType (elementPathWithTypePath, type.code, depth+1);
                        }
                    });
                }
            });
        }
    }
    else {
        console.log (elementPath + " = " + typeCode + " NOT FOUND");
    }
}
