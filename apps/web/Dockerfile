# 프론트를 이미지 안에서 빌드해 nginx로 서빙한다 (호스트에 Node가 없어도 된다)
FROM node:22-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY --from=build /web/dist /srv/web
