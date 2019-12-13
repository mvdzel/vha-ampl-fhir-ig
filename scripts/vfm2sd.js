const fs = require('fs');

//
// =========================== StructureDefinitions ===========================
//
let rawdata = fs.readFileSync('VistA_FHIR_Map_Full.json');
let vfm = JSON.parse(rawdata);

/*
   Make sure there is 1 SD per profiled Resource per group of VistA paths.
   So there can be multiple Observation, Provenance, etc profiles, but in each profile there will be only 1 Resource.
   Make sure that there is only 1 element per path!
   So if there are 2+ mappings (rows) for 1 path, they should be in 1 element!
   For [x] types the path can be either [x] or datatype, e.g. value[x] or valueQuantity.
   Order of elements is significant for XML not for JSON!
   Order of element entries is significant for StructDef for both XML and JSON!

   TODO: update date/meta/lastUpdated
*/

let elementsByPath = []; // paths per files/resource(=profileId)
let sds = [];
let profileIds = [];

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

    // sometimes there are whitespaces in the resource name and path, remove them
    var resourceName = row.FHIR_x0020_R2_x0020_resource.join().replace(' ','');
    var profileId = (row.path + '-' + resourceName).replace(' ', '');

    // ASSERT if profileId is a valid FHIR id type!
    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(profileId)) {
        console.warn(`${row.ID1}: profileId "${profileId}" not a valid FHIR id type`);
        return;
    }

    // get new structuredefinition and create if we don't have it already
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
        sds[profileId] = sd;
        profileIds.push(profileId);
    }

    // create empty element struct if not already defined and populate with mapping info
    var elementPath = (resourceName + '.' + row.FHIR_x0020_R2_x0020_property).replace(' ', '');

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

    if (elementsByPath[profileId] == undefined) {
        elementsByPath[profileId] = [];
    }
    var element = elementsByPath[profileId][elementPath];
    if (element == undefined) {
        element = elementsByPath[profileId][elementPath] = {
            path: elementPath,
            mapping: []
        };
        sd.differential.element.push(element);
    }
    element.label = row.Field_x0020_Name[0].trim();
    if (row.Data_x0020_Elements != undefined) { 
        element.short = row.Data_x0020_Elements[0].trim();
    }
    element.mapping.push ({ identity: "vista", map: `${row.File_x0020_Name} @${row.Field_x0020_Name} ${row.ID}` });
    if (row.description != undefined) {
        element.description = row.description[0].trim();
    }    

    /*
     Somehow there shouldbe a path valueQuantity so that the SD "knows" about the Quantity type.
     This is now not in the VistA_FHIR_Map table :-(
     TODO: figure out how we can detect this and add the valueQuantity property!
     */
    if (row.FHIR_x0020_R2_x0020_property[0] == "valueQuantity") {
        element.type = [ { code: "Quantity" } ]; 
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

// Write the profiles to separate files
profileIds.forEach(profileId => {
    var entry = sds[profileId];
    if (entry.differential.element.length == 0) {
        console.warn(`no mappings for ${profileId} so skipped`);
        return;
    } 
    fs.writeFile("resources/StructureDefinition-" + profileId + ".json", JSON.stringify(entry, null, 2));
});

// Display myig.xml resource xml part
profileIds.forEach(profileId => {
    var entry = sds[profileId];
    if (entry.differential.element.length == 0) {
        console.warn(`no mappings for ${profileId} so skipped`);
        return;
    } 
    console.log(`\
    <resource>
      <reference>
        <reference value="StructureDefinition/${profileId}"/>
      </reference>
      <name value="${profileId}"/>
      <description value=""/>
    </resource>`);
});

//
// =========================== ValueSets ===========================
//
let rawdata2 = fs.readFileSync('ValueSetMembership.json');
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
    fs.writeFile("resources/ValueSet-" + name + ".json", JSON.stringify(valueset, null, 2));
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