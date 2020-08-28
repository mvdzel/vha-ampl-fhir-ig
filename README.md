# Docker build

''N.B. Lines starting with '>' have to run on the host and '@>' inside the Docker image.''

Clone the project
```
> git clone https://github.com/mvdzel/vha-ampl-fhir-ig.git
```

Build the Docker image
```
> docker build -t vha-ampl-fhir-ig .
```

Start the Docker image
```
> docker run -it -v /home/michael/eclipse-workspace/vha-ampl-fhir-ig:/home/node/vha-ampl-fhir-ig -p 8080:8080 vha-ampl-fhir-ig
```

Run the script and IG publisher
```
@> cd vha-ampl-fhir-ig/script
@> node vfm2sd.js > part.xml 2> log.txt
@> cd ..
@> java -jar ../org.hl7.fhir.publisher.jar -ig ig.ini
@> http-server output
```
Point you local browser to http://localhost:8080/ to see output!

# Misc

Generate fhirProps.xml from fhir definitions http://hl7.org/fhir/STU3/definitions.json.zip
```
@> node fhirprops.js > fhirProps.xml 2> log3.txt
```

Update the project (local)
```
(if local changes) > git stash
> git pull
```