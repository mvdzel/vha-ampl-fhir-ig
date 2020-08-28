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
USER node
RUN curl -L https://github.com/HL7/fhir-ig-publisher/releases/latest/download/publisher.jar -o org.hl7.fhir.publisher.jar
RUN curl -L https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar -o org.hl7.fhir.validator.jar
RUN cd vha-ampl-fhir-ig/scripts ; npm update

CMD /bin/bash
