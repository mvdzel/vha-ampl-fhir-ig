# vha-ampl-fhir-ig

Prepare:
1. install git
1. install java (tested on java 1.8)
1. install node
1. git clone vha-ampl-ig
1. download Publisher (org.hl7.fhir.publisher.jar) from: https://fhir.github.io/latest-ig-publisher/
1. cd scripts
1. npm init

Run the script:
1. export the tables to xml from MS Access to scripts/input
1. cd scripts
1. node vfm2sd.js > part.xml 2> log.txt
1. add part.xml to myig.xml

Run locally:
1. extra to install: ruby + jekyll
1.. Ruby2.3
1.. Jekyll3.8
... don't install jekyll from apt use gem!
... gem install jekyll --version 3.8 ; seems to fix gsub issue (cannot update to version 4 because of dependency with Mint ditro I use
1. java -jar {path-to-publisher}/org.hl7.fhir.publisher.jar -ig ig.ini
... output folder now contains generated IG html (full-ig.zip) p.s. manually add qa.*

(WIP) Trigger on-line on fhir build ci
1. create bundle...
1. git commit...
... wait for auto-ig-builder
... check https://build.fhir.org/ig/mvdzel/vha-ampl-ig
