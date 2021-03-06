const { execSync } = require('child_process');
const fs = require('fs'),
    xml2js = require('xml2js');
var xml = new xml2js.Parser();

let date = new Date().toISOString();

//
// URI Constants
// - Current IG Publisher up to 1.1.42 requires prefix http://va.gov/fhir/us/vha-ampl-ig/
// - We want http://va.gov/fhir/ -> but that currently gives 2 RESOURCE_CANONICAL_MISMATCH per file :-(
//
const URI_STRUCTUREDEFINITION = "http://va.gov/fhir/us/vha-ampl-ig/StructureDefinition/"; // for Profiles and Extensions
const URI_CONCEPTGMAP = "http://va.gov/fhir/us/vha-ampl-ig/ConceptMap/";
const URI_VALUESET = "http://va.gov/fhir/us/vha-ampl-ig/ValueSet/";

//
// Make sure input and output folders exist
//
if (!fs.existsSync("input/")) {
    console.error("Expecting xml files (Access xml exports) in the script/input folder");
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

let lookup_typeByExtName = [];
let lookup_uriByExtName = [];
let lookup_typeByPath = [];
let lookup_needsExtraTypedPath = [];
var resourceNames = [];

// process fhirProperties (STU3 core) into lookup tables
let input_fhirProperties_core;
xml.parseString(fs.readFileSync('input/fhirProperties-core.xml'), function (err, result) {
    input_fhirProperties_core = result.dataroot;
});
input_fhirProperties_core.fhirProperties.forEach(row => {
    var type = `${row.type}`; // convert to string
    // Remove type options for Reference type, e.g. Reference(Patient|Provider)
    // TODO: split type options
    if(type.indexOf('(')!=-1) {
        type = type.substring(0,type.indexOf('(')).trim();
    }
    if (row.scope == "core" && row.type != undefined) {
        lookup_typeByPath[row.resource[0] + '.' + row.field] = type.substring(0,1).toUpperCase() + type.substring(1);
    }
    if (resourceNames.indexOf(row.resource[0]) == -1) {
        resourceNames.push(row.resource[0]);
    }
});

// process fhirProperties (not core) into different lookup tables
let input_fhirProperties;
xml.parseString(fs.readFileSync('input/fhirProperties.xml'), function (err, result) {
    input_fhirProperties = result.dataroot;
});
input_fhirProperties.fhirProperties.forEach(row => {
    var type = `${row.type}`; // convert to string
    // Remove type options for Reference type, e.g. Reference(Patient|Provider)
    // TODO: split type options
    if(type.indexOf('(')!=-1) {
        type = type.substring(0,type.indexOf('(')).trim();
    }
    if (row.scope != "core" && row.type != undefined) {
        // Check valid type
        switch(type) {
            case "boolean":
            case "Period":
            case "Timing":
            case "Quantity":
            case "SimpleQuantity":
            case "Text":
            case "Coding":
            case "Address":
            case "HumanName":
            case "ContactPoint":
            case "Uri":
            case "Attachment":
            case "integer":
            case "Range":
            case "Ratio":
            case "BackboneElement":
            case "code":
            case "date":
            case "Annotation":
            case "Reference":
            case "time":
            case "string":
            case "dateTime":
            case "Identifier":
            case "CodeableConcept":
                break;
            default:
                // Default to "String" so IG publisher narrative generator doesnot fail
                console.error (`ERROR: fhirProperties: invalid type '${type}' for extension ${row.field}`);
                type = "string";
                break;
        }

        lookup_typeByExtName[row.field] = type;
        if(row.extensionUrl != undefined) {
            lookup_uriByExtName[row.field] = row.extensionUrl[0];

            // exturi should end with extname in fhirProperties 
            if (!row.extensionUrl[0].endsWith(row.field)) {
                console.error (`WARN: fhirProperties: extension url should end with extension name ${row.extensionUrl[0]} ${row.field}`);
            }
        }
    }
    var textkey = row.textkey[0];
    if (textkey.endsWith("[x]")) {
        var extraPath = textkey.substring(0, textkey.indexOf('['));
        if (!lookup_needsExtraTypedPath.includes(extraPath)) {
            lookup_needsExtraTypedPath.push(extraPath);
        }
    }
});
// missing from fhirProperties so added manually
lookup_needsExtraTypedPath.push("MedicationRequest.dosageInstruction.timing.repeat.bounds");

//
// =========================== prepare myig-empty.xml ===========================
// update revision based on git revision
//
let output_myig;
xml.parseString(fs.readFileSync('input/myig-empty.xml'), function (err, result) {
    output_myig = result;
});
output_myig.ImplementationGuide.definition[0].grouping = [];
output_myig.ImplementationGuide.definition[0].resource = [];
var revision = execSync('git rev-list --count HEAD');
output_myig.ImplementationGuide.version[0].$.value = `0.0.${revision}`.trim();

//
// =========================== ValueSets ===========================
//
var vss;
xml.parseString(fs.readFileSync('input/ValueSetMembership.xml'), function (err, result) {
    vss = result.dataroot;
});

let valuesets = [];
let valuesetNames = [];
let valuesetUriById = [];

vss.valueSetMembership_x0020_Query.forEach(row => {
    var name = row.valueSetName[0];
    // ASSERT if valuesetname is a valid FHIR id type!
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(name)) {
        console.error(`ERROR: ValueSet '${name}' not a valid FHIR id`);
        return;
    }
    var code = row.code[0];
    var display = row.display[0];

    var valueset = valuesets[name];
    if (valueset == undefined) {
        valuesetUriById[row.valueSetID] = `${URI_VALUESET}${name}`;
        valueset = {
            resourceType: "ValueSet",
            id: name,
            url: `${URI_VALUESET}${name}`,
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

// Update myig.xml resource xml part
valuesetNames.forEach(name => {
    output_myig.ImplementationGuide.definition[0].resource.push ( {
        reference: {
            reference: { $: { value: `ValueSet/${name}` }}
        }, name: { $: { value: name }}});
});

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
    if (row.STU3Resource == undefined) {
        console.error(`${row.ID1}: ERROR: missing resource name`);
        return;
    }
    if (row.STU3Map == undefined) {
        console.error(`${row.ID1}: ERROR: missing property name`);
        return;
    }

    // Display myig.xml groupings xml part once for each group
    if (groupings[row.area] == undefined) {
        groupings[row.area] = true;
        var desc = lookup_descById[row.area];
        if (desc == undefined) { desc = "" };
        output_myig.ImplementationGuide.definition[0].grouping.push ( {
            $: { id: `group-${row.area}` },
            name: { $: { value: `Coversheet Area: ${lookup_labelById[row.area]}` } },
            description: { $: { value: desc } } });
    }

    // sometimes there are whitespaces in the resource name and path, remove them
    var resourceName = row.STU3Resource[0].trim();
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
        sd.url = `${URI_STRUCTUREDEFINITION}${profileId}`;
        sd.type = resourceName;
        sd.baseDefinition = `http://hl7.org/fhir/StructureDefinition/${resourceName}`;
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
        addDifferentialElement(sd, {
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
        }, row.ID1);
    }

    // proces fixed values
    // format: <propertyName>\n[<key>=<value>($|\n)]+
    // first line is property and next are fixed values; ignore empty lines
    var proplines = row.STU3Map[0].trim().split(/\r?\n+/);
    if (proplines.length > 1) {
        proplines.slice(1).forEach(propline => {
            if (/^.+=.+$/.test(propline)) {
                var parts = propline.split('=');
                var fixedKey = parts[0].trim();
                var fixedValue = parts[1].trim().replace(/"/g, ''); // also remove quotes
                if (!isNaN(fixedValue)) { // convert to number if number so it ends up as a number in the json
                    fixedValue = Number(fixedValue);
                }
                // create elementPath based on resource + property (first line only)
                var fixedElementPath = resourceName + '.' + fixedKey;
                // special case for ".targetProfile"
                if (fixedElementPath.endsWith(".targetProfile")) {
                    fixedElementPath = fixedElementPath.substring(0, fixedElementPath.lastIndexOf('.'));
                    var element = elementsByPath[profileId][fixedElementPath];
                    if (element == undefined) {
                        element = {
                            path: fixedElementPath,
                        };
                        element.mustSupport = true;
                        elementsByPath[profileId][fixedElementPath] = element;
                        addDifferentialElement(sd, element, row.ID1);
                    }
                    element.type = [ {
                        code: "Reference",
                        targetProfile: `${URI_STRUCTUREDEFINITION}${fixedValue}`
                    } ];
                    console.warn(`${row.ID1}: INFO: ${profileId} SET targetProfile '${fixedElementPath}'`);
                    return;
                }
                // ASSERT if fixedElementPath is valid
                if (!/^[A-Za-z][A-Za-z0-9]{1,63}(\.[a-z][A-Za-z0-9\-]{1,64}(\[x])?)*$/.test(fixedElementPath)) {
                    if (/\s/.test(fixedElementPath)) {
                        console.error(`${row.ID1}: ERROR: fixedElementPath '${fixedElementPath}' not a valid path, contains whitespace!`);
                    }
                    else {
                        console.error(`${row.ID1}: ERROR: fixedElementPath '${fixedElementPath}' not a valid path`);
                    }
                    return;
                }

                var fixedElement = elementsByPath[profileId][fixedElementPath];
                if (fixedElement == undefined) {
                    var fixedType = lookup_typeByPath[fixedElementPath];
                    if (fixedType == undefined) {
                        // Try some guessing based on the element name
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
                    else if (fixedType == "CodeableConcept" ||
                        fixedType == "Period") {
                        console.error(`${row.ID1}: ERROR fixedElementPath '${fixedElementPath}' cannot set fixed value for non primitive type ${fixedType}`);
                        return;
                    }
                    fixedElement = {
                        path: fixedElementPath
                    };
                    fixedElement[`fixed${fixedType}`] = fixedValue;
                    fixedElement.mustSupport = true;
                    elementsByPath[profileId][fixedElementPath] = fixedElement;
                    if (addDifferentialElement(sd, fixedElement, row.ID1)) {
                        console.warn(`${row.ID1}: INFO: ${profileId} ADD fixed value '${fixedElementPath}'`);
                    }
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

            // get url from fhirProperties field = extension.<name>, if there is no URL prefix with va.gov uri
            var exturi = lookup_uriByExtName[extname];
            if (exturi == undefined) {
                exturi = `${URI_STRUCTUREDEFINITION}${extname}`;
            }

            element = elementsByPath[profileId][elementPath] = {
                // id: `${prefix}.${extname}`, // id will be automatically generated by the IG Publisher!
                path: `${prefix}.extension`,
                sliceName: extname.replace(/\./g,'/'),
                type: [
                    {
                        code: "Extension",
                        profile: exturi
                    }
                ],
            };

            // Create extension only if this is a va.gov extension and not already created
            if (/\/va.gov\//.test(exturi)) {
                if (sds[extname] == undefined) {
                    var exttype = lookup_typeByExtName[extname];
                    if(exttype == undefined) {
                        exttype = "string";                    
                    }
                    // Assume CodeableConcept if valueSet specified 
                    if (row.valueSet != undefined) {
                        exttype = "CodeableConcept";
                    }
                    console.warn(`${row.ID1}: INFO: create new extension '${extname}' type '${exttype}'`);
                    sds[extname] = {
                        resourceType: "StructureDefinition",
                        id: extname,
                        url: exturi,
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
                                    // id: "Extension.url",
                                    path: "Extension.url",
                                    fixedUri: exturi
                                },
                                {
                                    // id: `Extension.value${exttype}`,
                                    path: "Extension.value" + exttype.substring(0,1).toUpperCase() + exttype.substring(1),
                                    type: [
                                        { code: exttype }
                                    ],
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
                    if (row.valueSet != undefined && valuesetUriById[row.valueSet] != undefined) {
                        sds[extname].differential.element[1].binding = {
                            strength: "preferred",
                            valueSetReference: {
                                reference: valuesetUriById[row.valueSet]
                            }
                        };
                    }
                    profileIds.push(extname);
                }
                if (sds[extname].context.indexOf(resourceName) == -1) {
                    sds[extname].context.push(resourceName);
                }
            }
        }
        else {
            element = elementsByPath[profileId][elementPath] = {
                path: elementPath
            };
        }
        addDifferentialElement(sd, element, row.ID1);
    }
    element.label = row.Field_x0020_Name[0].trim();
    if (row.Data_x0020_Elements != undefined) {
        element.short = row.Data_x0020_Elements[0].trim();
    }
    element.mustSupport = true;
    if (element.mapping == undefined) {
        element.mapping = [];
    }
    // Only add valueSet binding when not an Extension element, Extension valueSet binding is in the Extension
    if (!element.path.endsWith(".extension") && row.valueSet != undefined && valuesetUriById[row.valueSet] != undefined) {
        element.binding = {
            strength: "preferred",
            valueSetReference: {
                reference: valuesetUriById[row.valueSet]
            }
        };
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

// Update myig.xml resource xml part and write profile to file
profileIds.forEach(profileId => {
    var entry = sds[profileId];
    if (entry.differential.element.length == 0) {
        console.warn(`WARN: no mappings found in ${profileId}; no profile written`);
        return;
    }
    var desc = lookup_descByLabel[profileId];
    if (desc == undefined) { desc = "" };
    output_myig.ImplementationGuide.definition[0].resource.push ( {
        reference: {
            reference: { $: { value: `StructureDefinition/${profileId}` }}
        }, 
        name: { $: { value: profileId }},
        description: { $: { value: desc }},
        groupingId: { $: { value: entry.groupingId }},
    });
    delete entry.groupingId;
    fs.writeFileSync("../input/resources/StructureDefinition-" + profileId + ".json", JSON.stringify(entry, null, 2));
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
            url: `${URI_CONCEPTGMAP}${name}`,
            name: name,
            status: "draft",
            date: date,
            group: [ {
                source: row.sourceSystem[0],
                target: row.targetSystem[0],
                element: []
            } ]
        };
        conceptmaps[name] = conceptmap;
        conceptmapNames.push(name);
    }
    conceptmap.group[0].element.push({
        code: row.sourceCode[0],
        target: [{
            code: row.targetCode[0],
            equivalence: row.match[0],
            comment: row.sourceLabel[0]
        }
        ]
    });
});

// Write the conceptmaps to separate files
conceptmapNames.forEach(name => {
    var conceptmap = conceptmaps[name];
    fs.writeFileSync("../input/resources/ConceptMap-" + name + ".json", JSON.stringify(conceptmap, null, 2));
});

// Update myig.xml resource xml part
conceptmapNames.forEach(name => {
    output_myig.ImplementationGuide.definition[0].resource.push ( {
        reference: {
            reference: { $: { value: `ConceptMap/${name}` }}
        }, name: { $: { value: name }}});
});

// Write output myig.xml with resources and groupings inserted
var builder = new xml2js.Builder();
fs.writeFileSync("../input/myig.xml", builder.buildObject(output_myig));

//
// Helper function to check and add differential element and
// try to take order of the element in the profiled resource into account
//
function addDifferentialElement(sd, element, row_ID1) {
    var elementPath = element.path;
    var index = input_fhirProperties_core.fhirProperties.filter(row => row.textkey == elementPath);
    if (index[0]) {
        //console.error(`${row_ID1}: DEBUG: ${sd.name} ${elementPath} ` + index[0].order);
    }
    else {
        console.error(`${row_ID1}: ERROR: elementPath '${elementPath}' not an existing path`);
        return false;
    }
    sd.differential.element.push(element);
    return true;
}