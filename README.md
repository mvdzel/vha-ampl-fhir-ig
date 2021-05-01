# Docker build

''N.B. Lines starting with '>' have to run on the host and '@>' inside the Docker image.''

Clone the project (or update)
```
> git clone https://github.com/mvdzel/vha-ampl-fhir-ig.git
(update) > git pull
```

Build the Docker image
```
> docker build -t vha-ampl-fhir-ig .
```

Start the Docker image
```
> docker run -it -v "$(pwd)":/home/node/vha-ampl-fhir-ig -p 8080:8080 vha-ampl-fhir-ig
```

Initial setup (get the publisher and optionally the validator and init the node scripts)
```
> cd vha-ampl-fhir-ig
> curl -L https://github.com/HL7/fhir-ig-publisher/releases/latest/download/publisher.jar -o publisher.jar
> curl -L https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar -o validator_cli.jar
> cd scripts
> curl -L http://hl7.org/fhir/STU3/definitions.json.zip -o definitions.json.zip
> unzip definitions.json.zip -d definitions
> npm update
```

Run the script and IG publisher
```
@> cd vha-ampl-fhir-ig/scripts
@> node vfm2sd.js 2> log.txt
@> node fixorder.js
@> cd ..
@> java -jar publisher.jar -ig ig.ini
@> http-server output
```
Point you local browser to http://localhost:8080/ to see output!

# Misc

Generate fhirProps.xml from fhir definitions http://hl7.org/fhir/STU3/definitions.json.zip
Needed for vfm2sd.js and fixorder.js.
```
@> node fhirprops.js > fhirProps.xml 2> log3.txt
```

Update the project (local)
```
(if local changes) > git stash
> git pull
```

Run the FHIR Validator
```
@> java -jar validator_cli.jar -version 3.0.2 -ig input/resources {FILE_TO_VALIDATE}
```
or
```
@> java -jar ~/vha-ampl-fhir-ig/validator_cli.jar -version 3.0.2 -output validation-output.json StructureDefinition-VAFinishedOutpatientMedicationDispense.json -ig .
```