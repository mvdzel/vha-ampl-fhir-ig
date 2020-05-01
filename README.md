# vha-ampl-fhir-ig

Prepare:
1. install git
1. install java (tested on java 1.8)
1. install node
1. > git clone vha-ampl-ig
1. download Publisher (org.hl7.fhir.publisher.jar) from: https://fhir.github.io/latest-ig-publisher/
1. > cd scripts
1. > npm init

Run the script to gerenate the IG publisher input from the Access db:
1. export the tables (lookup, fhirProperties, conceptMap, ValueSetMembership, VistA_FHIR_Map) to xml from MS Access to scripts/input (n.b. create directory if it doesnot exist)
1. > cd scripts
1. optionally delete output folder (../input/resources)
1. > node vfm2sd.js > part.xml 2> log.txt
1. check if there are ERRORs to fix in log.txt
1. add part.xml to myig.xml

Run IG Publisher locally:
1. extra to install: ruby + jekyll
1. Ruby2.3
1. Jekyll3.8 (n.b. don't install jekyll from apt use gem!)
1. > gem install jekyll --version 3.8 ; seems to fix gsub issue (cannot update to version 4 because of dependency with Mint ditro I use
1. > java -jar {path_to_publisher}/org.hl7.fhir.publisher.jar -ig ig.ini
1. output folder now contains generated IG html (full-ig.zip) p.s. manually add qa.*

(WIP) Trigger on-line on fhir build ci
1. create bundle...
1. > git commit -a
1. wait for auto-ig-builder
1. check https://build.fhir.org/ig/mvdzel/vha-ampl-ig
