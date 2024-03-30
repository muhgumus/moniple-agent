FROM node:19-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY . .
RUN npm install
CMD node app.js