############################################
# Docker                                   #
#                                          #
# A container that enables the application #
# to run                                   #
############################################

FROM node:6-alpine

LABEL maintainer "Simon Emms <simon@simonemms.com>"

# Set the work directory and add the project files to it
WORKDIR /opt/app
ADD . /opt/app

ENV DROPBOX_KEY=""
ENV DROPBOX_PATH=""
ENV VIDEO_NAME=""
ENV VIDEO_SAVE_PATH=""

# Install dependencies
RUN apk add --update-cache ffmpeg && \
  chown -Rf node /opt

USER node

RUN npm install

# Run run run
CMD npm start
