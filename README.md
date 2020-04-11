# vha-ampl-fhir-ig

Prepare:
1. git
1. java
1. node
1. git clone vha-ampl-ig
1. cd scripts
1. npm init
1. git clone --depth 1 https://github.com/FHIR/latest-ig-publisher.git

Run:
1. cd scripts
1. node vfm2sd.js > part.xml
1. cd ..
1. java -jar ../latest-ig-publisher/org.hl7.fhir.publisher.jar -ig ig.ini