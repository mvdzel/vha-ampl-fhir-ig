#
# node 14.4.0
# openjdk 8
# ruby 2.3.3
# jekyll 3.1.6
#
FROM node:latest

WORKDIR /home/node
EXPOSE 8080

# System
RUN apt update
RUN apt -y install openjdk-8-jre-headless ruby-full
RUN gem install jekyll --version 3.8
RUN npm install --global http-server

# VHA AMPL FHIR IG
RUN git clone https://github.com/mvdzel/vha-ampl-fhir-ig.git
RUN cd vha-ampl-fhir-ig ; curl https://storage.googleapis.com/ig-build/org.hl7.fhir.publisher.jar -o org.hl7.fhir.publisher.jar
RUN cd vha-ampl-fhir-ig/scripts ; npm update

CMD /bin/bash
