FROM ubuntu:20.04

# bind .env
WORKDIR /opt/mre

# replace sh with bash
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# install dependencies
RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC apt-get install -y curl

# install nvm and npm
ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION 11.15.0
RUN curl --silent -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.2/install.sh | bash

RUN source $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# install private modules
RUN npm i -g yalc
COPY gui ./gui/
RUN cd ./gui/ && \
    npm install && \
    npm run build && \
    yalc publish --private

COPY public ./public/
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src/
RUN yalc add altvr-gui && \
    npm install && \
    npm run build

EXPOSE 3901/tcp
CMD npm start