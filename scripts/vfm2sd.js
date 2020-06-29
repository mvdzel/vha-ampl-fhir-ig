const fs = require('fs'),
    xml2js = require('xml2js');
var xml = new xml2js.Parser();
let date = new Date().toISOString();

//
// Make sure input and output folders exist
//
if (!fs.existsSync("input/")) {
    console.error("Expecting xml files in the script/input folder");
    return;
}
if (!fs.existsSync("../input/resources/")) {
    fs.mkdirSync('../input/resources/');
}

//
// =========================== Read Access Table Input ===========================
//
// These are XML Exports of the relevant Access Tables
// - VistA_FHIR_Map - for mappings and extensions
// - lookup - for groups and descriptions
// - ValueSetMembership (Query version)
// - conceptMap
// - fhirProperties - for type of the extensions and for type and attributes of resources
//

var input_mappings;
xml.parseString(fs.readFileSync('input/VistA_FHIR_Map.xml'), function (err, result) {
    input_mappings = result.dataroot;
});

// convert lookup table into an array
let input_lookup;
xml.parseString(fs.readFileSync('input/lookup.xml'), function (err, result) {
    input_lookup = result.dataroot;
});
let lookup_labelById = [];
let lookup_descByLabel = [];
let lookup_descById = [];
input_lookup.lookup.forEach(row => {
    lookup_labelById[row.id] = row.label;
    lookup_descByLabel[row.label] = row.desc;
    lookup_descById[row.id] = row.desc;
});

// process fhirProperties into different lookup tables
let input_fhirProperties;
xml.parseString(fs.readFileSync('input/fhirProperties.xml'), function (err, result) {
    input_fhirProperties = result.dataroot;
});
let lookup_typeByExtName = [];
let lookup_typeByPath = [];
let lookup_needsExtraTypedPath = [];
// accepted resourceNames; should be all in fhirProperties
let resourceNames = [
    "Address",
    "AllergyIntolerance",
    "Appointment",
    "CarePlan",
    "Condition",
    "Coverage",
    "DetectedIssue",
//    "DiagnosticOrder", // DSTU2 only
    "DiagnosticReport",
    "DocumentReference",
    "Encounter",
    "Flag",
    "Immunization",
    "Location",
    "Medication",
//    "MedicationAdministration",
    "MedicationDispense",
    "MedicationRequest", // DSTU2 "MedicationOrder"
    "MedicationStatement",
    "Observation",
    "Organization",
    "Patient",
    "Practitioner",
    "Provenance",
    "ReferralRequest",
    "Specimen"
];
input_fhirProperties.fhirProperties.forEach(row => {
    var type = `${row.type}`; // convert to string
    // Remove type options for Reference type, e.g. Reference(Patient|Provider)
    // TODO: split type options
    if(type.indexOf('(')!=-1) {
        type = type.substring(0,type.indexOf('(')).trim();
    }
    if (row.scope == "vaExtension" && row.type != undefined) {
        lookup_typeByExtName[row.field] = type.substring(0,1).toUpperCase() + type.substring(1);
    }
    if (row.scope == "core" && row.type != undefined) {
        lookup_typeByPath[row.resource + '.' + row.field] = type.substring(0,1).toUpperCase() + type.substring(1);
    }
    var textkey = `${row.textkey}`;
    if (textkey.endsWith("[x]")) {
        var extraPath = textkey.substring(0, textkey.indexOf('['));
        if (!lookup_needsExtraTypedPath.includes(extraPath)) {
            lookup_needsExtraTypedPath.push(extraPath);
        }
    }
    // add resourceName if missing
    if(!resourceNames.includes(row.resource[0])) {
        resourceNames.push(row.resource[0]);
    }
});
// missing from fhirProperties so added manually
lookup_needsExtraTypedPath.push("MedicationRequest.dosageInstruction.timing.repeat.bounds");
resourceNames = resourceNames.filter(item => item !== "DiagnosticOrder");
resourceNames = resourceNames.filter(item => item !== "MedicationAdministration");

//
// =========================== StructureDefinitions ===========================
//

/*
   Make sure there is 1 SD per profiled Resource per group of VistA paths.
   So there can be multiple Observation, Provenance, etc profiles, but in each profile there will be only 1 Resource.
   Make sure that there is only 1 element per path!
   So if there are 2+ mappings (rows) for 1 path, they should be in 1 element!
   For [x] types the path can be either [x] or datatype, e.g. value[x] or valueQuantity.
*/

let elementsByPath = []; // paths per files/resource(=profileId/extensionId)
let sds = [];
let profileIds = [];
let groupings = [];

input_mappings.VistA_FHIR_Map.forEach(row => {
    // Assertions that must be met
    if (row.path == undefined) {
        console.error(`${row.ID1}: ERROR: missing path`);
        return;
    }
    if (row.Field_x0020_Name == undefined) {
        console.error(`${row.ID1}: ERROR: missing field name`);
        return;
    }
    if (row.FHIR_x0020_R2_x0020_resource == undefined) {
        console.error(`${row.ID1}: ERROR: missing resource name`);
        return;
    }
    if (row.FHIR_x0020_R2_x0020_property == undefined) {
        console.error(`${row.ID1}: ERROR: missing property name`);
        return;
    }

    // Display myig.xml groupings xml part once for each group
    if (groupings[row.area] == undefined) {
        groupings[row.area] = true;
        var desc = lookup_descById[row.area];
        if (desc == undefined) { desc = "" };
        console.log(`\
        <grouping id="group-${row.area}">
            <name value="Coversheet Area: ${lookup_labelById[row.area]}"/>
            <description value="${desc}"/>
        </grouping>`);
    }

    // sometimes there are whitespaces in the resource name and path, remove them
    var resourceName = row.FHIR_x0020_R2_x0020_resource[0].trim();
    if (resourceNames.indexOf(resourceName) == -1) {
        console.error(`${row.ID1}: ERROR: resourceName '${resourceName}' not an existing resource`);
        return;
    }
    var profileId = row.path + '-' + resourceName;
    // prefer profilename instead of path if defined
    if (row.profile != undefined) {
        profileId = row.profile[0]; // + '-' + resourceName;
    }
    // remove [] from profileId
    profileId = profileId.replace('[', '').replace(']', '');
    // ASSERT if profileId is a valid FHIR id type!
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(profileId)) {
        console.error(`${row.ID1}: ERROR: profileId '${profileId}' not a valid FHIR id`);
        return;
    }

    // get StructureDefinition and create if we don't have already
    var sd = sds[profileId];
    if (sd == undefined) {
        // create empty sd based on template EmptyObsSD
        sd = JSON.parse(fs.readFileSync("EmptyObsSD.json"));
        // create empty elements array
        sd.differential.element = [];
        sd.name = profileId;
        sd.id = profileId;
        sd.url = "http://va.gov/fhir/us/vha-ampl-ig/StructureDefinition/" + profileId;
        sd.type = resourceName;
        sd.baseDefinition = "http://hl7.org/fhir/StructureDefinition/" + resourceName;
        sd.derivation = "constraint";
        sd.date = date;
        sd.meta.lastUpdated = date;
        sd.groupingId = `group-${row.area}`;
        if(lookup_descByLabel[profileId] != undefined) {
            sd.description = lookup_descByLabel[profileId][0];
        }
        sds[profileId] = sd;
        profileIds.push(profileId);
    }
    else if (resourceName != sd.type) {
        console.error(`${row.ID1}: ERROR resourceName '${resourceName}' is different from type '${sd.type}'?`);
        return;
    }

    // create element path array for profile if not already created
    if (elementsByPath[profileId] == undefined) {
        elementsByPath[profileId] = [];
        // AUTO add slicing setup for extension
        sd.differential.element.push({
            path: `${resourceName}.extension`,
            slicing: {
                discriminator: [ {
                        "type": "value",
                        "path": "url"
                    }
                ],
                ordered: false,
                rules: "open"
            }
        });
    }

    // proces fixed values
    // format: <propertyName>\n[<key>=<value>($|\n)]+
    // first line is property and next are fixed values; ignore empty lines
    var proplines = row.FHIR_x0020_R2_x0020_property[0].trim().split(/\r?\n+/);
    if (proplines.length > 1) {
        proplines.slice(1).forEach(propline => {
            if (/^.+=.+$/.test(propline)) {
                var parts = propline.split('=');
                var fixedKey = parts[0].trim();
                var fixedValue = parts[1].trim().replace(/"/g, ''); // also remove quotes
                // create elementPath based on resource + property (first line only)
                var fixedElementPath = resourceName + '.' + fixedKey;
                // ASSERT if fixedElementPath is valid
                if (!/^[A-Za-z][A-Za-z0-9]{1,63}(\.[a-z][A-Za-z0-9\-]{1,64}(\[x])?)*$/.test(fixedElementPath)) {
                    console.error(`${row.ID1}: ERROR: fixedElementPath '${fixedElementPath}' not a valid path`);
                    return;
                }

                var fixedElement = elementsByPath[profileId][fixedElementPath];
                if (fixedElement == undefined) {
                    var fixedType = lookup_typeByPath[fixedElementPath];// !!! TODO: default to "code" if the fixedElementPath ends with .code
                    if (fixedType == undefined) {
                        if (fixedElementPath.endsWith(".code")) {
                            console.error(`${row.ID1}: WARN fixedElementPath '${fixedElementPath}' unknow path. Assume type Code`);
                            fixedType = "Code";
                        }
                        else if (fixedElementPath.endsWith(".system")) {
                            console.error(`${row.ID1}: WARN fixedElementPath '${fixedElementPath}' unknow path. Assume type Uri`);
                            fixedType = "Uri";
                        }
                        else {
                            console.error(`${row.ID1}: WARN fixedElementPath '${fixedElementPath}' unknown path. Assume type String`);
                            fixedType = "String";
                        }
                    }
                    else if (fixedType == "CodeableConcept") {
                        console.error(`${row.ID1}: ERROR fixedElementPath '${fixedElementPath}' cannot set fixed value for non primitive type ${fixedType}`);
                        return;
                    }
                    fixedElement = {
                        path: fixedElementPath
                    };
                    fixedElement[`fixed${fixedType}`] = fixedValue;
                    elementsByPath[profileId][fixedElementPath] = fixedElement;
                    sd.differential.element.push(fixedElement);
                    console.warn(`${row.ID1}: INFO: ${profileId} ADD fixed value '${fixedElementPath}'`);
                }
                else {
                    console.warn(`${row.ID1}: WARN: ${profileId} MULTIPLE fixed values for '${fixedElementPath}'?`);
                }
            }
            else if (propline.length > 0) {
                console.warn(`${row.ID1}: WARN: ${profileId} IGNORE invalid fixed value format: '${propline}'`);
            }
        });
    }
    // create elementPath based on resource + property (first line only)
    var elementPath = (resourceName + '.' + proplines[0]).trim();
    // ASSERT if elementPath is valid (R4 eld-20 + ~eld-19)
    if (!/^[A-Za-z][A-Za-z0-9]{1,63}(\.[a-z][A-Za-z0-9\-]{1,64}(\[x])?)*$/.test(elementPath)) {
        console.error(`${row.ID1}: ERROR: elementPath '${elementPath}' not a valid path`);
        return;
    }

    // Check for missing [x]; N.B. do this after the ASSERT of the elementPath!
    // TODO: Ook als er iets achteraan komt !
    // if (lookup_needsExtraTypedPath.includes(elementPath)) {
    //     console.error(`${row.ID1}: ERROR: ${profileId} needsExtraTypedPath type[x] missing for '${elementPath}'`);
    //     return;
    // }
    var passed_needsExtraTypedPath = true;
    lookup_needsExtraTypedPath.forEach(extraPath => {
        if (elementPath == extraPath) {
            console.error(`${row.ID1}: ERROR: type missing for '${elementPath}'`);
            passed_needsExtraTypedPath = false;
        }
        else if (elementPath.startsWith(extraPath)) {
            if (/\[x\]/.test(elementPath)) {
                console.error(`${row.ID1}: ERROR: type missing for '${elementPath}'`);
                passed_needsExtraTypedPath = false;
            }
            else if (elementPath.indexOf('.', extraPath.length) == -1) {
                // This is the extra types path; so nothing to fix here
            }
            else {
                var extraTypedPath = elementPath.substring(0, elementPath.indexOf('.', extraPath.length));
                if (extraTypedPath == extraPath) {
                    console.error(`${row.ID1}: ERROR: type missing for '${extraTypedPath}'`);
                    passed_needsExtraTypedPath = false;
                }
                else {
                    // AUTO: There should be a path effective/medication/value<type> so that the IG "knows" about the choosen [x] type.
                    console.warn(`${row.ID1}: WARN: ${profileId} AUTO add type path '${extraTypedPath}'`);
                    if (elementsByPath[profileId][extraTypedPath] == undefined) {
                        var extraElement = elementsByPath[profileId][extraTypedPath] = {
                            path: extraTypedPath
                        };
                        sd.differential.element.push(extraElement);
                    }
                }
            }
        }
    });
    if (!passed_needsExtraTypedPath) {
        // This element did not pass the needsExtraType check; because the type was not specified in the input
        return;
    }

    // create empty element struct (based on elementPath) if not already defined and populate with mappings and other info
    var element = elementsByPath[profileId][elementPath];
    if (element == undefined) {
        // new INTERNAL extension?
        if (proplines.length > 0 && elementPath.indexOf(".extension.") != -1) {
            console.warn(`${row.ID1}: INFO: ${profileId} ADD extension element '${elementPath}'`);
            var prefix = elementPath.substring(0,elementPath.indexOf(".extension."));
            var extname = elementPath.substring(elementPath.indexOf(".extension.") + ".extension.".length);
            // ASSERT if extname is a valid FHIR id type!
            if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(extname)) {
                console.error(`${row.ID1}: ERROR: extname "${extname}" not a valid FHIR id`);
                return;
            }

            element = elementsByPath[profileId][elementPath] = {
                // id: `${prefix}.${extname}`, // id will be automatically generated by the IG Publisher!
                path: `${prefix}.extension`,
                name: extname,
                type: [
                    {
                        code: "Extension",
                        profile: [ `http://va.gov/fhir/us/vha-ampl-ig/StructureDefinition/${extname}` ]
                    }
                ],
            };

            if (sds[extname] == undefined) {
                var exttype = lookup_typeByExtName[extname];
                if(exttype == undefined) {
                    exttype = "String";                    
                }
                console.warn(`${row.ID1}: INFO: create new extension '${extname}' type '${exttype}'`);
                sds[extname] = {
                    resourceType: "StructureDefinition",
                    // id: extname, // id will be automatically generated by the IG Publisher!
                    url: `http://va.gov/fhir/us/vha-ampl-ig/StructureDefinition/${extname}`,
                    name: extname,
                    fhirVersion: "3.0.2",
                    status: "draft",
                    date: date,
                    type: "Extension",
                    baseDefinition: "http://hl7.org/fhir/StructureDefinition/Extension",
                    derivation: "constraint",
                    abstract: false,
                    mapping: [
                        {
                          identity: "vista",
                          name: "VistA",
                          uri: "http://va.gov/vista/"
                        }
                    ],
                    // TODO: figure out kind resource or datatype
                    kind: "resource",
                    contextType: "resource",
                    context: [],
                    differential: {
                        element: [
                            {
                                path: "Extension.url",
                                // type: [
                                //     { code: "uri" }
                                // ],
                                fixedUri: `http://va.gov/fhir/us/vha-ampl-ig/StructureDefinition/${extname}`
                            },
                            {
                                path: `Extension.value${exttype}`,
                                mapping: [
                                    { identity: "vista", map: `${row.File_x0020_Name} @${row.Field_x0020_Name} ${row.ID}` }
                                ]
                            }
                        ]
                    },
                    groupingId: `group-${row.area}`
                };
                if (row.description != undefined) {
                    sds[extname].description = row.description[0].trim();
                }
                profileIds.push(extname);
            }
            sds[extname].context.push(resourceName);
        }
        else {
            element = elementsByPath[profileId][elementPath] = {
                path: elementPath
            };
        }
        sd.differential.element.push(element);
    }
    element.label = row.Field_x0020_Name[0].trim();
    if (row.Data_x0020_Elements != undefined) {
        element.short = row.Data_x0020_Elements[0].trim();
    }
    if(element.mapping == undefined) {
        //console.warn(`${row.ID1}: DEBUG: mapping[] created for ${element.path}`);
        element.mapping = [];
    }
    element.mapping.push({ identity: "vista", map: `${row.File_x0020_Name} @${row.Field_x0020_Name} ${row.ID}` });
    if (row.description != undefined) {
        element.definition = row.description[0].trim();
    }

    if (/\[x\]/.test(elementPath)) {
        console.error(`${row.ID1}: ERROR: type missing for '${elementPath}'`);
        return;
    }
});

// Display myig.xml resource xml part and write profile to file
profileIds.forEach(profileId => {
    var entry = sds[profileId];
    if (entry.differential.element.length == 0) {
        console.warn(`WARN: no mappings found in ${profileId}; no profile written`);
        return;
    }
    var desc = lookup_descByLabel[profileId];
    if (desc == undefined) { desc = "" };
    console.log(`\
    <resource>
      <reference>
        <reference value="StructureDefinition/${profileId}"/>
      </reference>
      <name value="${profileId}"/>
      <description value="${desc}"/>
      <groupingId value="${entry.groupingId}"/>
    </resource>`);
    delete entry.groupingId;
    fs.writeFileSync("../input/resources/StructureDefinition-" + profileId + ".json", JSON.stringify(entry, null, 2));
});

//
// =========================== ValueSets ===========================
//
var vss;
xml.parseString(fs.readFileSync('input/ValueSetMembership.xml'), function (err, result) {
    vss = result.dataroot;
});

let valuesets = [];
let valuesetNames = [];

vss.ValueSetMembership_x0020_Query.forEach(row => {
    var name = row.valueSetName[0];
    // ASSERT if profileId is a valid FHIR id type!
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(name)) {
        console.error(`ERROR: ValueSet '${name}' not a valid FHIR id`);
        return;
    }
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
    fs.writeFileSync("../input/resources/ValueSet-" + name + ".json", JSON.stringify(valueset, null, 2));
});

// Display myig.xml resource xml part
valuesetNames.forEach(name => {
    console.log(`\
    <resource>
      <reference>
        <reference value="ValueSet/${name}"/>
      </reference>
      <name value="${name}"/>
    </resource>`);
});

//
// =========================== ConceptMaps ===========================
//
var cms;
xml.parseString(fs.readFileSync('input/conceptMap.xml'), function (err, result) {
    cms = result.dataroot;
});

let conceptmaps = [];
let conceptmapNames = [];

cms.conceptMap.forEach(row => {
    var name = row.conceptMapName[0];
    // ASSERT if profileId is a valid FHIR id type!
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(name)) {
        console.error(`${row.ID1}: ERROR: ConceptMap '${name}' not a valid FHIR id`);
        return;
    }
    // First some assertions
    if (row.targetSystem == undefined) {
        console.error(`${row.ID}: WARN: ConceptMap '${name}' row without target mapping ignored`);
        return;
    }
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
    fs.writeFileSync("../input/resources/ConceptMap-" + name + ".json", JSON.stringify(conceptmap, null, 2));
});

// Display myig.xml resource xml part
conceptmapNames.forEach(name => {
    console.log(`\
    <resource>
      <reference>
        <reference value="ConceptMap/${name}"/>
      </reference>
      <name value="${name}"/>
    </resource>`);
});
