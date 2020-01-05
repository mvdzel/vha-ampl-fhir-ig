const fs = require('fs');

//
// =========================== StructureDefinitions ===========================
//
let rawdata = fs.readFileSync('input/VistA_FHIR_Map_5.json');
let vfm = JSON.parse(rawdata);

let date = new Date().toISOString();

// convert lookup table into an array
let rawlookupdata = fs.readFileSync('input/lookup.json');
let lookuptable = JSON.parse(rawlookupdata);
let lookup = [];
lookuptable.lookup.forEach(row => {
    lookup[row.id] = row.label;
});

/*
   Make sure there is 1 SD per profiled Resource per group of VistA paths.
   So there can be multiple Observation, Provenance, etc profiles, but in each profile there will be only 1 Resource.
   Make sure that there is only 1 element per path!
   So if there are 2+ mappings (rows) for 1 path, they should be in 1 element!
   For [x] types the path can be either [x] or datatype, e.g. value[x] or valueQuantity.
   Order of elements is significant for XML not for JSON!
   Order of element entries is significant for StructDef for both XML and JSON!
*/

let elementsByPath = []; // paths per files/resource(=profileId)
let sds = [];
let profileIds = [];
let groupings = [];

vfm.VistA_FHIR_Map.forEach(row => {
    // Assertions that must be met
    if (row.path == undefined) {
        console.warn(`${row.ID1}: missing path`);
        return;
    }
    if (row.Field_x0020_Name == undefined) {
        console.warn(`${row.ID1}: missing field name`);
        return;
    }
    // TODO: resource name shall start with a capital!
    if (row.FHIR_x0020_R2_x0020_resource == undefined) {
        console.warn(`${row.ID1}: missing resource name`);
        return;
    }
    if (row.FHIR_x0020_R2_x0020_property == undefined) {
        console.warn(`${row.ID1}: missing property name`);
        return;
    }

    // Display myig.xml groupings xml part once for each group
    if (groupings[row.Coversheet_x0020_area] == undefined) {
        groupings[row.Coversheet_x0020_area] = true;
        console.log(`\
        <grouping id="group-${row.Coversheet_x0020_area}">
            <name value="Coversheet Area: ${lookup[row.Coversheet_x0020_area]}"/>
        </grouping>`);
    }

    // sometimes there are whitespaces in the resource name and path, remove them
    var resourceName = row.FHIR_x0020_R2_x0020_resource[0].trim();
    var profileId = (row.path + '-' + resourceName).replace(' ', '');
    if (row.profile != undefined) {
        profileId = (row.profile + '-' + resourceName).replace(' ', '');
    }

    // ASSERT if profileId is a valid FHIR id type!
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(profileId)) {
        console.warn(`${row.ID1}: profileId "${profileId}" not a valid FHIR id type`);
        return;
    }

    // get StructureDefinition and create if we don't have already
    var sd = sds[profileId];
    if (sd == undefined) {
        // create empty sd (TODO: per file/resource)
        sd = JSON.parse(fs.readFileSync("EmptyObsSD.json"));
        // create empty elements array
        sd.differential.element = [];
        sd.name = profileId;
        sd.id = profileId;
        sd.url = "http://va.gov/fhir/us/vha-ampl-ig/StructureDefinition/" + profileId;
        sd.base = "http://hl7.org/fhir/StructureDefinition/" + resourceName;
        sd.constrainedType = resourceName;
        sd.date = date;
        sd.meta.lastUpdated = date;
        sd.groupingId = `group-${row.Coversheet_x0020_area}`;

        sds[profileId] = sd;
        profileIds.push(profileId);
    }

    // create element path array for profile if not already created
    if (elementsByPath[profileId] == undefined) {
        elementsByPath[profileId] = [];
    }

    // proces fixed values after property!
    // format <propertyName>\n[<key>=<value>($|\n)]+
    var proplines = row.FHIR_x0020_R2_x0020_property[0].trim().split("\n");
    if (proplines.length > 1) {
        proplines.forEach(propline => {
            if (/^.+=.+$/.test(propline)) {
                //console.warn(`${row.ID1}: ${profileId} KEY=VALUE: ${propline}`);
                var parts = propline.split('=');
                var fixedKey = parts[0].trim();
                var fixedValue = parts[1].trim();
                // create elementPath based on resource + property (first line only)
                var fixedElementPath = resourceName + '.' + fixedKey;

                var fixedElement = elementsByPath[profileId][fixedElementPath];
                if (fixedElement == undefined) {
                    fixedElement = {
                        path: fixedElementPath,
                        "fixedString": fixedValue,
                        mapping: []
                    };
                    elementsByPath[profileId][fixedElementPath] = fixedElement;
                    sd.differential.element.push(fixedElement);
                    console.warn(`${row.ID1}: ${profileId} ADDED fixed value ${fixedElementPath}` + JSON.stringify(fixedElement, null, 2));
                }
                else {
                    console.warn(`${row.ID1}: ${profileId} DUPLICATE fixed value ${fixedElementPath}`);
                }
                fixedElement.mapping.push({ identity: "vista", map: `${row.File_x0020_Name} @${row.Field_x0020_Name} ${row.ID}` });
            }
            else {
                console.warn(`${row.ID1}: ${profileId} IGNORED invalid fixed value format: ${propline}`);
            }
        });
    }
    // create elementPath based on resource + property (first line only)
    var elementPath = (resourceName + '.' + proplines[0]).replace(' ', '');

    // ASSERT if elementPath is valid
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(elementPath)) {
        console.warn(`${row.ID1}: elementPath "${elementPath}" not a valid path`);
        return;
    }

    // REPAIR missing [x]; N.B. do this after the ASSERT of the elementPath!
    if (elementPath == "Observation.effective") elementPath += "[x]";
    if (elementPath == "Observation.value") elementPath += "[x]";
    if (elementPath == "Observation.component.value") elementPath += "[x]";
    if (elementPath == "MedicationOrder.medication") elementPath += "[x]";
    if (elementPath == "MedicationOrder.dispenseRequest.medication") elementPath += "[x]";
    if (elementPath == "MedicationDispense.medication") elementPath += "[x]";

    // create empty element struct (based on elementPath) if not already defined and populate with mappings and other info
    var element = elementsByPath[profileId][elementPath];
    if (element == undefined) {
        // special case for extensions
        if (proplines.length > 0 && proplines[0].startsWith("extension.")) {
            console.warn("EXTENSION: " + elementPath);
            var extname = proplines[0].substring(proplines[0].indexOf('.') + 1);
            element = elementsByPath[profileId][elementPath] = {
                path: `${resourceName}.extension`,
                name: extname,
                type: [
                    {
                        code: "Extension",
                        profile: [
                            `http://va.gov/fhir/StructureDefinition/${extname}`
                        ]
                    }
                ],
                mapping: []
            };

            if (sds[extname] == undefined) {
                console.warn("CREATE EXTENSION: " + extname);
                sds[extname] = {
                    resourceType: "StructureDefinition",
                    id: extname,
                    url: `http://va.gov/fhir/StructureDefinition/${extname}`,
                    name: extname,
                    fhirVersion: "1.0.2",
                    status: "draft",
                    date: date,
                    base: "http://hl7.org/fhir/StructureDefinition/Extension",
                    constrainedType: "Extension",
                    kind: "resource",
                    contextType: "resource",
                    context: [],
                    differential: {
                        element: [
                            {
                                path: "Extension.url",
                                type: [
                                    {
                                        code: "uri"
                                    }
                                ],
                                fixedUri: `http://va.gov/fhir/StructureDefinition/${extname}`
                            },
                            {
                                path: "Extension.valueString"
                            }
                        ]
                    },
                    groupingId: "group-extensions"
                };
                profileIds.push(extname);
            }
            sds[extname].context.push(resourceName);
        }
        else {
            element = elementsByPath[profileId][elementPath] = {
                path: elementPath,
                mapping: []
            };
        }
        sd.differential.element.push(element);
    }
    element.label = row.Field_x0020_Name[0].trim();
    if (row.Data_x0020_Elements != undefined) {
        element.short = row.Data_x0020_Elements[0].trim();
    }
    element.mapping.push({ identity: "vista", map: `${row.File_x0020_Name} @${row.Field_x0020_Name} ${row.ID}` });
    if (row.description != undefined) {
        element.definition = row.description[0].trim();
    }

    // AUTO REPAIR: There should be a path effective/medication/value<type> so that the IG "knows" about the choosen [x] type.
    if (/^Observation\.value.+\..+$/.test(elementPath) ||
        /^MedicationOrder\.medication.+\..+$/.test(elementPath) ||
        /^MedicationStatement\.effective.+\..+$/.test(elementPath) ||
        /^MedicationDispense\.medication.+\..+$/.test(elementPath)) {
        var extraElementPath = resourceName + '.' + row.FHIR_x0020_R2_x0020_property[0].substring(0, row.FHIR_x0020_R2_x0020_property[0].indexOf('.'));
        console.warn(`${row.ID1}: ${profileId} AUTOTYPE ${extraElementPath}`);
        if (elementsByPath[profileId][extraElementPath] == undefined) {
            var extraElement = elementsByPath[profileId][extraElementPath] = {
                path: extraElementPath
            };
            sd.differential.element.push(extraElement);
        }
    }
});

// Create Bundle collection with the profiles
// let bundle = {
//     resourceType: "Bundle", id: "vista-mappings", type: "collection", entry: []
// };
// profileIds.forEach(profileId => {
//     var entry = sds[profileId];
//     bundle.entry.push ({ resource: entry });
// });
// console.log(JSON.stringify(bundle, null, 2));

// Display myig.xml resource xml part and write profile to separate file
profileIds.forEach(profileId => {
    var entry = sds[profileId];
    if (entry.differential.element.length == 0) {
        console.warn(`IGNORED: no mappings found in ${profileId}`);
        return;
    }
    console.log(`\
    <resource>
      <reference>
        <reference value="StructureDefinition/${profileId}"/>
      </reference>
      <name value="${profileId}"/>
      <description value=""/>
      <groupingId value="${entry.groupingId}"/>
    </resource>`);
    delete entry.groupingId;
    fs.writeFile("output/StructureDefinition-" + profileId + ".json", JSON.stringify(entry, null, 2));
});

//
// =========================== ValueSets ===========================
//
let rawdata2 = fs.readFileSync('input/ValueSetMembership.json');
let vss = JSON.parse(rawdata2);

let valuesets = [];
let valuesetNames = [];

vss.ValueSetMembership.forEach(row => {
    var name = row.valueSetName[0];
    var code = row.code[0];
    var display = row.display[0];

    var valueset = valuesets[name];
    if (valueset == undefined) {
        valueset = {
            resourceType: "ValueSet",
            id: name,
            url: `http://va.gov/fhir/us/vha-ampl-ig/ValueSet/${name}`,
            name: name,
            status: "draft",
            date: date,
            compose: {
                include: [
                    {
                        system: "http://va.gov/Terminology/VistaDefinedTerms/",
                        concept: []
                    }
                ]
            }
        };
        valuesets[name] = valueset;
        valuesetNames.push(name);
    }
    valueset.compose.include[0].concept.push({
        "code": code,
        "display": display
    });
});

// Write the valuesets to separate files
valuesetNames.forEach(name => {
    var valueset = valuesets[name];
    fs.writeFile("output/ValueSet-" + name + ".json", JSON.stringify(valueset, null, 2));
});

// Display myig.xml resource xml part
valuesetNames.forEach(name => {
    console.log(`\
    <resource>
      <reference>
        <reference value="ValueSet/${name}"/>
      </reference>
      <name value="${name}"/>
      <description value=""/>
    </resource>`);
});

//
// =========================== ConceptMaps ===========================
//
let rawdata3 = fs.readFileSync('input/conceptMap.json');
let cms = JSON.parse(rawdata3);

let conceptmaps = [];
let conceptmapNames = [];

cms.conceptMap.forEach(row => {
    // First some assertions
    if (row.targetSystem == undefined) return;

    var name = row.conceptMapName[0];
    var conceptmap = conceptmaps[name];
    if (conceptmap == undefined) {
        conceptmap = {
            resourceType: "ConceptMap",
            id: name,
            url: `http://va.gov/fhir/us/vha-ampl-ig/ConceptMap/${name}`,
            name: name,
            status: "draft",
            date: date,
            sourceReference: {
                reference: row.sourceSystem[0]
            },
            targetReference: {
                reference: row.targetSystem[0]
            },
            element: []
        };
        conceptmaps[name] = conceptmap;
        conceptmapNames.push(name);
    }
    conceptmap.element.push({
        codeSystem: row.sourceSystem[0],
        code: row.sourceCode[0],
        target: [{
            codeSystem: row.targetSystem[0],
            code: row.targetCode[0],
            equivalence: row.match[0],
            comments: row.sourceLabel[0]
        }
        ]
    });
});

// Write the conceptmaps to separate files
conceptmapNames.forEach(name => {
    var conceptmap = conceptmaps[name];
    fs.writeFile("output/ConceptMap-" + name + ".json", JSON.stringify(conceptmap, null, 2));
});

// Display myig.xml resource xml part
conceptmapNames.forEach(name => {
    console.log(`\
    <resource>
      <reference>
        <reference value="ConceptMap/${name}"/>
      </reference>
      <name value="${name}"/>
      <description value=""/>
    </resource>`);
});
