# vha-ampl-fhir-ig

Prepare:
1. git
1. java
1. node
1. git clone vha-ampl-ig
1. cd scripts
1. npm init
1. download publisher.jar

Run:
1. cd scripts
1. node vfm2sd.js > part.xml
1. cd ..
1. java org.hl7.fhir.publisher -ig ig.ini