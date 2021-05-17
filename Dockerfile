#
# node 14.4.0
# openjdk 8
# ruby 2.3.3
# jekyll 3.1.6
#
FROM node:lts-buster

WORKDIR /home/node
EXPOSE 8080

# System
RUN apt update
RUN apt install -y openjdk-11-jdk-headless curl ruby-full
RUN gem install jekyll --version 3.8
RUN npm install --global http-server

# VHA AMPL FHIR IG
USER node

CMD /bin/bash
